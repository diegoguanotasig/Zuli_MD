import openai

def suggest_topic(messages):

    text = "\n".join(messages)

    prompt = f"""
    The following discussion may not match the topic.

    Messages:
    {text}

    Suggest a short new topic title (max 6 words).
    """

    response = openai.ChatCompletion.create(
        model="gpt-4o-mini",
        messages=[{"role":"user","content":prompt}],
        temperature=0.2
    )

    return response.choices[0].message.content