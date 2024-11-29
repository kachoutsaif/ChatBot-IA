from django.shortcuts import redirect, render
from django.http import JsonResponse
from dotenv import load_dotenv
import requests
import os
import logging
import time
import json
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import csrf_exempt
from .models import Chat, Message
from django.core.serializers.json import DjangoJSONEncoder
import langid

# Configuration du journal
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Chargement des variables d'environnement
load_dotenv()

mistral_api_key = os.getenv('MISTRAL_API_KEY')
if mistral_api_key is None:
    raise ValueError("No MISTRAL_API_KEY environment variable set")

mistral_api_url = "https://api.mistral.ai/v1/chat/completions"

def logout_view(request):
    logout(request)
    return redirect('login')

@csrf_exempt
def login_view(request):
    if request.method == 'POST':
        username = request.POST['username']
        password = request.POST['password']
        user = authenticate(request, username=username, password=password)
        if user is not None:
            login(request, user)
            return redirect('chatbot')
        else:
            return render(request, 'login.html', {'error': 'Nom d\'utilisateur ou mot de passe incorrect.'})
    return render(request, 'login.html')

def ask_mistral(message):
    lang, _ = langid.classify(message)
    language_instruction = "Réponds en français à la question suivante : " if lang == 'fr' else "Answer the following question in English: "
    full_message = language_instruction + message

    headers = {
        'Authorization': f'Bearer {mistral_api_key}',
        'Content-Type': 'application/json'
    }
    data = {
        "model": "mistral-medium",  # Changé de "mistral-small" à "mistral-medium"
        "messages": [
            {"role": "user", "content": full_message}
        ],
        "max_tokens": 1000,
        "temperature": 0.7,
    }

    logger.info(f"Request headers: {headers}")
    logger.info(f"Request data: {json.dumps(data)}")

    for attempt in range(3):
        try:
            response = requests.post(mistral_api_url, headers=headers, json=data)
            logger.info(f"HTTP Status: {response.status_code}")
            logger.info(f"Raw response: {response.text}")
            
            response.raise_for_status()
            json_response = response.json()
            answer = json_response['choices'][0]['message']['content'].strip()
            return answer
        except requests.exceptions.RequestException as req_err:
            logger.error(f"Request error occurred: {req_err}")
            if response.status_code == 403:
                logger.error(f"Forbidden error. Check API key and account status.")
            if "Inactive subscription or usage limit reached" in str(req_err):
                return "SERVICE_UNAVAILABLE"
        except (json.JSONDecodeError, KeyError) as e:
            logger.error(f"Error parsing JSON response: {e}")
        except Exception as e:
            logger.error(f"Unexpected error: {e}")
        time.sleep(10)
    return "ERROR"


@login_required
def chatbot(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        message = data.get('message')
        chat_id = data.get('chat_id')
        
        response = ask_mistral(message)
        
        if response == "SERVICE_UNAVAILABLE":
            return JsonResponse({
                'error': 'Service temporairement indisponible. Veuillez réessayer plus tard.'
            }, status=503)
        elif response == "ERROR":
            return JsonResponse({
                'error': 'Une erreur s\'est produite. Veuillez réessayer plus tard.'
            }, status=500)
        
        if chat_id:
            chat = Chat.objects.get(id=chat_id, user=request.user)
        else:
            chat = Chat.objects.create(user=request.user, title=message[:30])
        
        Message.objects.create(chat=chat, content=message, is_user=True)
        Message.objects.create(chat=chat, content=response, is_user=False)
        
        return JsonResponse({
            'message': message,
            'response': response,
            'chat_id': chat.id,
            'chat_title': chat.title
        })
    
    chats = Chat.objects.filter(user=request.user).order_by('-updated_at')
    chats_data = json.dumps(list(chats.values('id', 'title', 'created_at')), cls=DjangoJSONEncoder)
    
    user = request.user
    user_initials = ""
    if user.first_name and user.last_name:
        user_initials = f"{user.first_name[0]}{user.last_name[0]}".upper()
    elif user.username:
        user_initials = user.username[0].upper()
    else:
        user_initials = "U"

    context = {
        'chats_data': chats_data,
        'user_full_name': user.get_full_name(),
        'user_initials': user_initials,
    }
    
    return render(request, 'chatbot.html', context)

@login_required
def get_chat(request, chat_id):
    chat = Chat.objects.get(id=chat_id, user=request.user)
    messages = chat.messages.order_by('created_at')
    return JsonResponse({
        'chat_id': chat.id,
        'chat_title': chat.title,
        'messages': list(messages.values('content', 'is_user'))
    })

@login_required
def rename_chat(request, chat_id):
    if request.method == 'POST':
        chat = Chat.objects.get(id=chat_id, user=request.user)
        new_title = json.loads(request.body).get('title')
        chat.title = new_title
        chat.save()
        return JsonResponse({'success': True})

@login_required
def delete_chat(request, chat_id):
    if request.method == 'POST':
        chat = Chat.objects.get(id=chat_id, user=request.user)
        chat.delete()
        return JsonResponse({'success': True})
    
@login_required
@require_POST
def clear_all_chats(request):
    Chat.objects.filter(user=request.user).delete()
    return JsonResponse({'success': True})