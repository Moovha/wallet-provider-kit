import type { ProviderConfiguration } from './config.js';

/** Configuration warnings only. Never infer remote readiness from these inputs. */
export function setupWarnings(config: ProviderConfiguration): string[] {
  const warnings: string[] = [];
  if (!config.activation.enabled)
    warnings.push(
      'Activation is disabled. The deployed service will deny wallet operations until acceptance is recorded and activation is enabled.',
    );
  for (const [vendor, settings] of Object.entries(config.identity)) {
    if (!settings.verificationPrice)
      warnings.push(
        `${vendor}: new hosted identity verification is blocked until an agreed verification price bound is configured, even for a free workflow.`,
      );
    if (!settings.importPrice)
      warnings.push(
        `${vendor}: shared identity import is blocked until an agreed import price bound is configured.`,
      );
  }
  for (const [index, application] of config.policy.applications.entries()) {
    if (application.enabled === false) continue;
    if (!application.funding)
      warnings.push(
        `Application ${index + 1}: new verification and identity import are blocked until an application funding agreement and monthly USD-cent budget are configured.`,
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
        `Application ${index + 1}: its monthly identity budget is smaller than at least one configured vendor price bound.`,
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
      'Transfer signing is configured but no enabled application is permitted to request transfers on behalf of its users.',
    );
  if (config.backend.kind === 'ows')
    warnings.push(
      'OWS requires the pinned native engine and a separate private vault on the deployment host; the reference Docker image omits that engine.',
    );
  return warnings;
}
