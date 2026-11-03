FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --ignore-scripts

COPY src ./src
COPY config ./config

# The config loader locates the repository root from src/config.js and resolves
# topology/policy paths relative to that root. Recreate the required root marker
# and repository-relative dashboard config path inside this isolated image.
RUN touch README.md \
    && mkdir -p orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/dashboard-api \
    && ln -s /app/config orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/dashboard-api/config \
    && mkdir -p orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/dashboard-api/data \
    && mkdir -p orgs/hospital/EHR_hospitalOrg-main/ehr-backend-v3/dashboard-api/credentials \
    && chown -R node:node /app

ENV NODE_ENV=production
ENV PORT=4010
EXPOSE 4010

USER node
CMD ["npm", "start"]
