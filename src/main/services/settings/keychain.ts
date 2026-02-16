import keytar from "keytar";

const SERVICE_NAME = "gitagen";

export async function setAIApiKey(providerId: string, apiKey: string): Promise<void> {
	await keytar.setPassword(SERVICE_NAME, `ai-provider-${providerId}`, apiKey);
}

export async function getAIApiKey(providerId: string): Promise<string | null> {
	return (await keytar.getPassword(SERVICE_NAME, `ai-provider-${providerId}`)) ?? null;
}

export async function deleteAIApiKey(providerId: string): Promise<boolean> {
	return await keytar.deletePassword(SERVICE_NAME, `ai-provider-${providerId}`);
}

export async function getAllAIApiKeys(): Promise<Record<string, string>> {
	const credentials = await keytar.findCredentials(SERVICE_NAME);
	const apiKeys: Record<string, string> = {};
	for (const cred of credentials) {
		if (cred.account.startsWith("ai-provider-")) {
			const providerId = cred.account.replace("ai-provider-", "");
			apiKeys[providerId] = cred.password;
		}
	}
	return apiKeys;
}
