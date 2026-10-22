export type TemplateKind = 'image' | 'video';
export type OperatorRole = 'support' | 'operator' | 'superadmin';

export type AdminResourceName = 'workspaces' | 'users' | 'generations' | 'billing' | 'audit' | 'affiliate-reviews' | 'affiliate-holds';
export type AdminView = 'overview' | AdminResourceName | 'operations';

export type AdminCapability = Readonly<{
  id: string;
  label: string;
  runtimeSupported: boolean;
  fields: readonly string[];
  actions: readonly string[];
  note?: string;
}>;

export type AdminCapabilityManifest = Readonly<{
  templateKind: TemplateKind;
  templateLabel: string;
  commonModules: readonly string[];
  resources: readonly AdminResourceName[];
  capabilities: Readonly<{
    mediaPreview: AdminCapability;
    modelControls: AdminCapability;
    assetMetadata: AdminCapability;
    recoveryEvidence: AdminCapability;
  }>;
}>;

const commonModules = Object.freeze([
  'overview',
  'users',
  'workspaces',
  'generation-tasks',
  'assets',
  'billing-credits',
  'models-providers',
  'audit',
  'recovery',
]);

const commonResources = Object.freeze<AdminResourceName[]>([
  'workspaces',
  'users',
  'generations',
  'billing',
  'audit',
  'affiliate-reviews',
  'affiliate-holds',
]);

const videoManifest: AdminCapabilityManifest = Object.freeze({
  templateKind: 'video',
  templateLabel: 'Video template',
  commonModules,
  resources: commonResources,
  capabilities: {
    mediaPreview: {id: 'video-preview', label: 'Video preview', runtimeSupported: true, fields: ['previewUrl', 'duration', 'dimensions', 'format'], actions: ['inspect']},
    modelControls: {id: 'video-model-controls', label: 'Video model controls', runtimeSupported: true, fields: ['model', 'provider', 'duration', 'resolution'], actions: ['inspect'], note: 'Only server-backed model fields should be added to a resource response.'},
    assetMetadata: {id: 'video-asset-metadata', label: 'Video asset metadata', runtimeSupported: true, fields: ['format', 'duration', 'dimensions', 'frameRate'], actions: ['inspect', 'recover']},
    recoveryEvidence: {id: 'video-recovery', label: 'Video recovery evidence', runtimeSupported: true, fields: ['providerCostState', 'failureCode', 'inboxId', 'version'], actions: ['inspect', 'retry']},
  },
});

const imageManifest: AdminCapabilityManifest = Object.freeze({
  templateKind: 'image',
  templateLabel: 'Image template',
  commonModules,
  resources: commonResources,
  capabilities: {
    mediaPreview: {id: 'image-preview', label: 'Image preview', runtimeSupported: false, fields: [], actions: [], note: 'Image generation runtime is not shipped in this repository; media controls remain withheld.'},
    modelControls: {id: 'image-model-controls', label: 'Image model controls', runtimeSupported: false, fields: [], actions: [], note: 'Image model controls become available only when an image runtime contract is implemented.'},
    assetMetadata: {id: 'image-asset-metadata', label: 'Image asset metadata', runtimeSupported: false, fields: [], actions: [], note: 'Image asset administration is contract-only until image asset endpoints exist.'},
    recoveryEvidence: {id: 'image-recovery', label: 'Image recovery evidence', runtimeSupported: false, fields: [], actions: [], note: 'Image recovery commands are not exposed by the current server contract.'},
  },
});

export function getAdminCapabilities(templateKind: TemplateKind = 'video'): AdminCapabilityManifest {
  return templateKind === 'image' ? imageManifest : videoManifest;
}

export function resolveTemplateKind(value: unknown): TemplateKind {
  return value === 'image' ? 'image' : 'video';
}

export function canOperate(role: OperatorRole | null | undefined): boolean {
  return role === 'operator' || role === 'superadmin';
}

