import openai

def summarize_messages(messages):

    prompt = f"""
    Summarize these Zulip messages in a short paragraph.
    Keep important decisions and action items.

    Messages:
    {messages}
    """

    response = openai.ChatCompletion.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3
    )

    return response["choices"][0]["message"]["content"]