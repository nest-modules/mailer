FROM node:lts

WORKDIR /app/website

EXPOSE 3000

COPY ./apps/website /app/website

RUN npm install

CMD ["npm", "start"]
