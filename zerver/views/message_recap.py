from zerver.models import Message
from django.http import JsonResponse

def get_unread_messages(request):

    user = request.user

    unread = Message.objects.filter(
        recipient__type=2,
        usermessage__user_profile=user,
        usermessage__flags__contains=["unread"]
    )

    data = []

    for m in unread[:50]:
        data.append({
            "id": m.id,
            "content": m.content
        })

    return JsonResponse({"messages": data})