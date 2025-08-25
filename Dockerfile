FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
COPY prisma ./prisma
RUN npx prisma generate
COPY docker/entrypoints/ai-agent.sh docker/entrypoints/ai-agent.sh
RUN chmod +x docker/entrypoints/ai-agent.sh
RUN npm run build
ENV PORT=3001
EXPOSE 3001
CMD ["./docker/entrypoints/ai-agent.sh"]
