# CoinDCX Altcoin Scanner Bot

This bot scans all altcoins listed on CoinDCX every 2 minutes across multiple timeframes (5m, 15m, 30m, 1h) and sends Telegram alerts when a specific green candle pattern relative to EMAs (9, 15, 50, 200) is detected.

## Running Locally

1. Install Python 3.10+ and pip.
2. Install dependencies:
   ```
   pip install -r requirements.txt
   ```
3. Run the bot:
   ```
   python3 src/bot/scan_bot.py
   ```

## Deploying on Render for 24x7 Running

1. Push your project to a GitHub repository.
2. Create a new Web Service or Background Worker on [Render](https://render.com).
3. Connect your GitHub repository.
4. Set environment variables in Render dashboard:
   - `TELEGRAM_BOT_TOKEN` (your Telegram bot token)
   - `TELEGRAM_CHAT_ID` (your Telegram chat ID)
5. Set the start command to:
   ```
   python3 src/bot/scan_bot.py
   ```
6. Deploy and the bot will run continuously.

## Notes

- Make sure your Telegram bot token and chat ID are kept secret.
- You can monitor logs on Render dashboard.
- For any issues, check the logs and restart the service if needed.
