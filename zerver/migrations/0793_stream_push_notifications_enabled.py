from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("zerver", "0792_fix_animated_emoji_still_images"),
    ]

    operations = [
        migrations.AddField(
            model_name="stream",
            name="push_notifications_enabled",
            field=models.BooleanField(default=False),
        ),
    ]
