// A provider access denial halts this campaign; it is never retried or bypassed.
// Do not infer whether the cause was credentials, account policy, or availability.
export class ProviderAccessGuard {
  private denied = false;

  observe(failure?: { stage?: string; status?: number }) {
    if (
      failure?.stage === "model" &&
      (failure.status === 401 || failure.status === 403)
    )
      this.denied = true;
  }

  stopped = () => this.denied;
}

export function blockedCampaignTrial(model: string) {
  return {
    provider: "meta",
    model,
    stopReason: "campaign-blocked",
    error:
      "Not started after provider access denial; retained in the planned denominator.",
    failure: {
      stage: "campaign",
      code: "provider-access-denied",
      call: 0,
      elapsedMs: 0,
    },
    proofVerified: false,
    observations: [],
    actions: [],
    toolRefusals: [],
    metrics: {
      requests: 0,
      modelCalls: 0,
      inputTokens: 0,
      outputTokens: 0,
      formatNormalizations: 0,
    },
  };
}
