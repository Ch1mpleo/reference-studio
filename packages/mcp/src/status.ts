export const MCP_ADAPTER_STATUS = "not_implemented" as const;

export function describeAdapter(contractVersion: number): string {
  return `Reference Studio MCP adapter is not implemented yet (contract v${contractVersion}). Start with milestone M3. The application service is started with npm run dev.`;
}
