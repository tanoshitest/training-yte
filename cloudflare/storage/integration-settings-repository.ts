import { defaultIntegrationSettings, type IntegrationSettings } from "../integration-settings";
import type { BlockRepository } from "./block-repository";
import type { SyncReport, TxClient } from "./relational-table-sync";

/** Cấu hình tích hợp là một khối duy nhất nên chỉ có một dòng, khóa cố định. */
const INTEGRATION_ROW_ID = "integration";

export const integrationSettingsRepository: BlockRepository<IntegrationSettings> = {
  key: "integrations:steps-demo",

  async read(tx: TxClient) {
    const row = await tx.opsIntegrationSetting.findUnique({ where: { id: INTEGRATION_ROW_ID } });
    if (!row) return defaultIntegrationSettings();
    return row.payload as unknown as IntegrationSettings;
  },

  async write(tx: TxClient, value: IntegrationSettings): Promise<SyncReport[]> {
    await tx.opsIntegrationSetting.upsert({
      where: { id: INTEGRATION_ROW_ID },
      create: { id: INTEGRATION_ROW_ID, payload: value as never, updatedAt: value.updatedAt, updatedBy: value.updatedBy },
      update: { payload: value as never, updatedAt: value.updatedAt, updatedBy: value.updatedBy },
    });
    return [];
  },
};
