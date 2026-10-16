import type { ProviderConfiguration } from './config.js';

/** Configuration warnings only. Never infer remote readiness from these inputs. */
export function setupWarnings(config: ProviderConfiguration): string[] {
  const warnings: string[] = [];
  if (config.policy.identity?.records)
    warnings.push(
      'Application-record evaluation uses provider-reviewed application assertions, not externally verified KYC. Keep wallets unfunded; financial signing is unavailable.',
    );
  if (!config.activation.enabled)
    warnings.push(
      'Wallet operations are disabled. Complete the wallet backend and recovery tests, then enable operations in Deployment, export and restart the service.',
    );
  for (const [vendor, settings] of Object.entries(config.identity)) {
    if (!settings.verificationPrice)
      warnings.push(
        `${vendor === 'didit' ? 'Didit' : 'Sumsub'}: new identity checks are unavailable. In Services, set the agreed verification price limit, including 0 for an agreed free workflow.`,
      );
    if (!settings.importPrice)
      warnings.push(
        `${vendor === 'didit' ? 'Didit' : 'Sumsub'}: shared identity import is unavailable. In Services, set the agreed import price limit.`,
      );
  }
  for (const [index, application] of config.policy.applications.entries()) {
    if (config.policy.identity?.records) continue;
    if (application.enabled === false) continue;
    if (config.policy.access?.mode === 'application') continue;
    if (!application.funding)
      warnings.push(
        `Application ${index + 1}: identity checks and imports are unavailable. In Policies, record its funding agreement and monthly identity budget in USD cents.`,
      );
    else if (
      Object.values(config.identity).some((vendor) =>
        [vendor.importPrice, vendor.verificationPrice].some(
          (price) =>
            price &&
            price.maximumMinor > application.funding!.monthlyLimitMinor,
        ),
      )
    )
      warnings.push(
        `Application ${index + 1}: its monthly identity budget is smaller than a vendor's per-request price limit. Review the agreed budget in Policies and prices in Services.`,
      );
  }
  if (
    config.financial &&
    !config.policy.applications.some(
      (app) =>
        app.enabled !== false && app.permissions?.includes('transfers:request'),
    )
  )
    warnings.push(
      'Transfer signing is configured, but no enabled application can request transfers. In Policies, select Request transfers on behalf of users for the intended application, or turn off transfer signing.',
    );
  if (config.backend.kind === 'ows')
    warnings.push(
      'OWS requires the pinned native engine and a separate private vault on the deployment host; the reference Docker image omits that engine.',
    );
  return warnings;
}
