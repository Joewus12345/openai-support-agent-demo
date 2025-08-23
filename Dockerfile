FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
ENV PORT=3001
EXPOSE 3001
CMD ["npm", "run", "start"]
