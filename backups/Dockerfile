# Use an official Python runtime as a parent image
FROM python:3.9-slim

# Set working directory in the container
WORKDIR /app

# Install dependencies for Chrome and ChromeDriver
RUN apt-get update && apt-get install -y \
    wget \
    unzip \
    gnupg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Add Google Chrome repository
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list

# Install the latest Google Chrome
RUN apt-get update && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Download a specific ChromeDriver version
RUN wget -O /tmp/chromedriver.zip "https://storage.googleapis.com/chrome-for-testing-public/136.0.7103.92/linux64/chromedriver-linux64.zip" \
    && unzip /tmp/chromedriver.zip -d /usr/bin/ \
    && mv /usr/bin/chromedriver-linux64/chromedriver /usr/bin/chromedriver \
    && rm -rf /usr/bin/chromedriver-linux64 \
    && rm /tmp/chromedriver.zip \
    && chmod +x /usr/bin/chromedriver

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the script and necessary files
COPY geodnet_scraper_updated.py .
COPY service-account-credentials.json .

# Command to run the script
CMD ["python", "geodnet_scraper_updated.py"]