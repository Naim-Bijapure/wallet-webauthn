import {
  GenerateRegistrationOptionsOpts, // Registration
  generateRegistrationOptions,
} from "@simplewebauthn/server";

const RP_ID = "localhost";

export default async function handler(request: Request | any, response: Response | any) {
  if (request.method === "POST") {
  }

  const opts: GenerateRegistrationOptionsOpts = {
    rpName: "SimpleWebAuthn Example",
    rpID: RP_ID,
    userID: "N",
    userName: "N",
    timeout: 60000,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "discouraged",
    },
    /**
     * Support the two most common algorithms: ES256, and RS256
     */
    supportedAlgorithmIDs: [-7, -257],
  };
  const options = await generateRegistrationOptions(opts);

  return response.json({ options });
}
