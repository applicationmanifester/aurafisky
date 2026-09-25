// src/services/EntitlementService.ts
import { localAuthService } from './LocalAuthService.ts';
import { localSyncService } from './LocalSyncService.ts';
import { FEATURES } from '../config/constants.ts';

interface Entitlement {
  tier: 'free' | 'pro' | 'trial';
  trialEndsAt?: number;
  subscriptionId?: string;
}

let cachedEntitlement: Entitlement = { tier: 'free' };
let listeners = new Set<(ent: Entitlement) => void>();

function updateFromProfile(notify = true) {
  const profile = localAuthService.profile;
  if (profile) {
    const oldTier = cachedEntitlement.tier;
    cachedEntitlement = {
      tier: profile.tier,
      trialEndsAt: undefined,
      subscriptionId: undefined,
    };
    if (notify && oldTier !== profile.tier) {
      for (const fn of listeners) fn(cachedEntitlement);
    }
  }
}

// Listen for auth changes
localAuthService.on('auth:changed', () => updateFromProfile(true));
// Listen for preference changes (tier upgrades)
localAuthService.on('preferences:changed', () => updateFromProfile(true));

export const entitlementService = {
  async getAll(): Promise<Entitlement> {
    updateFromProfile(false);
    return cachedEntitlement;
  },

  subscribe(callback: (ent: Entitlement) => void) {
    listeners.add(callback);
    callback(cachedEntitlement);
    // Also subscribe to sync service for any entitlement doc changes
    const unsub = localSyncService.entitlements.subscribe((ent: any) => {
      if (ent) {
        cachedEntitlement = ent;
        for (const fn of listeners) fn(ent);
      }
    });
    return () => {
      listeners.delete(callback);
      unsub();
    };
  },

  async canAddBookmark(currentCount: number): Promise<boolean> {
    const ent = await this.getAll();
    if (ent.tier === 'pro' || ent.tier === 'trial') return true;
    return currentCount < 3;
  },

  async canAddAlert(currentCount: number): Promise<boolean> {
    const ent = await this.getAll();
    if (ent.tier === 'pro' || ent.tier === 'trial') return true;
    return currentCount < 3;
  },

  hasFeature(feature: string): boolean {
    const ent = cachedEntitlement;
    if (ent.tier === 'pro' || ent.tier === 'trial') return true;
    return false;
  },
};

export default entitlementService;