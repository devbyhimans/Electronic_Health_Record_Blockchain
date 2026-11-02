FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --ignore-scripts

COPY src ./src
COPY config ./config

ENV NODE_ENV=production
ENV PORT=4010
EXPOSE 4010

USER node
CMD ["npm", "start"]
