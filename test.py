# ... existing code ...

# 전체 응답 재생성 함수 추가
async def regenerate_full_response(original_query: str, failed_command: str, error_msg: str) -> dict:
    """
    오류 정보를 바탕으로 전체 LLM 응답을 재생성하는 함수
    
    Args:
        original_query (str): 원래 사용자 질문
        failed_command (str): 실패한 명령어
        error_msg (str): 오류 메시지
        
    Returns:
        dict: 재생성된 응답 (content, commands 포함)
    """
    # 관련 명령어 검색
    detailed_commands = get_related_commands_details(original_query, top_k=5)
    
    # 오류 정보를 포함한 프롬프트 생성
    system_messages = [command, geo_gebra_rules, naming_rules]
    
    # 관련 명령어 프롬프트 추가
    if detailed_commands:
        related_commands_prompt = {
            "role": "system",
            "content": f"""
            [IMPORTANT] RELEVANT GEOGEBRA COMMANDS FOR THIS QUERY:
            (Commands are listed in order of relevance, most relevant first)
            {detailed_commands[0]}
            {detailed_commands[1] if len(detailed_commands) > 1 else ""}
            {detailed_commands[2] if len(detailed_commands) > 2 else ""}
            {detailed_commands[3] if len(detailed_commands) > 3 else ""}
            {detailed_commands[4] if len(detailed_commands) > 4 else ""}
            
            YOU MUST EXPLICITLY state which of these commands you are using in your response.
            YOU MUST include the exact syntax of the commands you use.
            YOU MUST explain why you chose these specific commands.
            
            If none of these commands are suitable, explain why and suggest alternatives.
            """
        }
        system_messages.append(related_commands_prompt)
    
    # 오류 정보 프롬프트 추가
    error_prompt = {
        "role": "system",
        "content": f"""
        [CRITICAL] The following command failed with an error:
        - Command: {failed_command}
        - Error: {error_msg}
        
        Please revise your entire explanation and command sequence to fix this issue.
        Analyze why the command failed and provide a corrected approach.
        Make sure all commands are syntactically correct according to GeoGebra's requirements.
        """
    }
    system_messages.append(error_prompt)
    
    # 검증 관련 프롬프트 추가
    validation_reminder = {
        "role": "system", 
        "content": """
        Please ensure your commands are syntactically correct. The commands will be validated in a GeoGebra environment. 
        Use proper syntax for GeoGebra commands (e.g., Circle(A, 3) or Line(A, B)).
        """
    }
    system_messages.append(validation_reminder)
    
    # 참조 명령어 표시 강조 메시지 추가
    reference_reminder = {
        "role": "system", 
        "content": """
        At the end, you must display all the commands which system provided and specify the referenced commands in the following format:
        
        ---
        Given Commands:
        1. [Command Name] - [Syntax] 
        2. [Command Name] - [Syntax] 
        3. [Command Name] - [Syntax]
        4. [Command Name] - [Syntax]
        5. [Command Name] - [Syntax]
        Referenced Commands:
        1. [Command Name] - [Syntax] - [Reason for choosing this command]
        2. [Command Name] - [Syntax] - [Reason for choosing this command]
        3. [Command Name] - [Syntax] - [Reason for choosing this command]
        ---
        """
    }
    system_messages.append(reference_reminder)
    
    # 사용자 쿼리 추가
    user_message = {"role": "user", "content": original_query}
    
    # 전체 메시지 구성
    full_messages = system_messages + [user_message]
    
    try:
        # OpenAI API 호출
        response = openai.chat.completions.create(
            model="gpt-4o-mini",  # 또는 다른 모델 사용
            messages=[{"role": msg["role"], "content": str(msg["content"])} for msg in full_messages],
            temperature=0.3  # 더 결정적인 응답을 위해 낮은 온도 사용
        )
        
        content = response.choices[0].message.content
        
        # 생성된 명령어 추출
        commands = extract_commands(content)
        
        return {
            "content": content,
            "commands": commands
        }
        
    except Exception as e:
        print(f"응답 재생성 오류: {str(e)}")
        return {
            "content": f"명령어 수정 중 오류가 발생했습니다: {str(e)}",
            "commands": []
        }

# WebSocket 엔드포인트 수정
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    # 사용자 쿼리 저장용 변수
    user_query = ""
    
    try:
        while True:
            # 프론트엔드로부터 데이터 수신
            data = await websocket.receive_json()
            
            # 메시지 타입에 따라 처리
            message_type = data.get('type', '')
            
            if message_type == 'query':
                # 사용자 쿼리 저장
                user_query = data.get('query', '')
                await websocket.send_json({
                    "type": "confirmation",
                    "message": "쿼리가 저장되었습니다."
                })
                
            elif message_type == 'command_result':
                # 명령어 실행 결과 처리
                command = data.get('command', '')
                success = data.get('success', False)
                error = data.get('error', '')
                
                if not success and error:
                    if data.get('regenerate_full', False) and user_query:
                        # 전체 응답 재생성 요청인 경우
                        print(f"전체 응답 재생성 요청: {command}, 오류: {error}")
                        
                        # 전체 응답 재생성
                        regenerated = await regenerate_full_response(user_query, command, error)
                        
                        # 재생성된 응답 전송
                        await websocket.send_json({
                            "type": "full_correction",
                            "content": regenerated["content"],
                            "commands": regenerated["commands"],
                            "original_command": command,
                            "error": error
                        })
                    else:
                        # 단일 명령어만 수정하는 경우
                        corrected = await correct_command(command, error)
                        
                        await websocket.send_json({
                            "type": "command_correction",
                            "original": command,
                            "corrected": corrected,
                            "error": error
                        })
                
                elif success:
                    # 성공한 경우 로깅
                    await websocket.send_json({
                        "type": "confirmation",
                        "message": "명령어 실행 성공",
                        "command": command
                    })
            
            else:
                # 알 수 없는 메시지 타입
                await websocket.send_json({
                    "type": "error",
                    "message": f"알 수 없는 메시지 타입: {message_type}"
                })
                
    except WebSocketDisconnect:
        print("클라이언트 연결 종료")
    except Exception as e:
        print(f"WebSocket 오류: {str(e)}")
        await websocket.close(code=1011)

# ... existing code ...