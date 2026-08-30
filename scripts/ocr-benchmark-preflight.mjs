import fs from "node:fs";

const variables = [
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_CLOUD_PROJECT",
  "GOOGLE_CLOUD_LOCATION",
  "GOOGLE_DOCUMENT_AI_PROCESSOR_ID",
  "AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT",
  "AZURE_DOCUMENT_INTELLIGENCE_KEY"
];

const environment = Object.fromEntries(variables.map(name => [name, Boolean(process.env[name])]));
const googleCredentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || "";
const result = {
  schemaVersion: 1,
  environment,
  googleCredentialsFileExists: googleCredentialsPath ? fs.existsSync(googleCredentialsPath) : false,
  googleDocumentAiReady: environment.GOOGLE_APPLICATION_CREDENTIALS
    && environment.GOOGLE_CLOUD_PROJECT
    && environment.GOOGLE_DOCUMENT_AI_PROCESSOR_ID,
  azureDocumentIntelligenceReady: environment.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT
    && environment.AZURE_DOCUMENT_INTELLIGENCE_KEY
};

console.log(JSON.stringify(result, null, 2));
