# # urls.py
# from django.urls import path
# from . import views

# urlpatterns = [
#     path('', views.chatbot, name='chatbot'),
# ]

from django.urls import path
from . import views

urlpatterns = [
    path('', views.login_view, name='login'),
    path('chatbot/', views.chatbot, name='chatbot'),
    path('logout/', views.logout_view, name='logout'),
    path('get_chat/<int:chat_id>/', views.get_chat, name='get_chat'),
    path('rename_chat/<int:chat_id>/', views.rename_chat, name='rename_chat'),
    path('delete_chat/<int:chat_id>/', views.delete_chat, name='delete_chat'),
    path('clear_all_chats/', views.clear_all_chats, name='clear_all_chats'),
]