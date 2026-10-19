FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev --legacy-peer-deps || npm install --legacy-peer-deps

COPY . .

EXPOSE 3000

CMD ["npm", "start"]
