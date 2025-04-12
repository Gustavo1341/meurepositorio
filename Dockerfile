FROM node:18-slim

WORKDIR /usr/src/app

COPY package*.json ./

# Instalar dependências do sistema necessárias para algumas bibliotecas Node
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Instalar as dependências do projeto
RUN npm install

# Instalar a biblioteca pdfjs-dist explicitamente
RUN npm install pdfjs-dist

COPY . .

RUN npx prisma generate

EXPOSE 3000

CMD [ "npm", "start" ]