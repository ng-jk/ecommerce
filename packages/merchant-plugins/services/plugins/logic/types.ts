export type PluginInstallation = {
  id: number;
  plugin_id: "loyalty";
  version: number;
  enabled: boolean;
  customer_enabled: boolean;
  max_credit: number;
  created_at: string;
  updated_at: string;
};
export type PluginDraft = {
  enabled: boolean;
  customer_enabled: boolean;
  max_credit: number;
};
export type PluginClient = {
  list(
    page?: number,
    enabled?: boolean,
  ): Promise<{
    plugins: {
      data: PluginInstallation[];
      meta: {
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
      };
    };
    options: { plugin_id: Record<string, string> };
  }>;
  detail(id: number): Promise<{
    plugin: PluginInstallation;
    options: { plugin_id: Record<string, string> };
  }>;
  install(
    principalId: number,
    draft: PluginDraft,
  ): Promise<{ plugin: PluginInstallation }>;
  update(
    principalId: number,
    id: number,
    expectedVersion: number,
    draft: PluginDraft,
  ): Promise<{ plugin: PluginInstallation }>;
  balance(): Promise<{ balance: { points: number } }>;
  credit(
    principalId: number,
    userId: number,
    points: number,
    reason: string,
  ): Promise<{ balance: { points: number } }>;
};
