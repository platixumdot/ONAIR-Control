export type Person = { id: string; name: string; role: string; company?: string; color: string; initials: string };
export type ObsScene = { name: string; index: number };
export type ObsInput = { name: string; kind: string; muted: boolean };
export type AppState = { version: 2; obs: { url: string; password: string }; branding: { primary: string; accent: string; show: string }; people: Person[]; lowerThird: Person | null; lowerThirdVisible: boolean; countdown: { endsAt: number | null; visible: boolean; title: string }; hotkeys: Record<string, string> };
export type RuntimeState = { connected: boolean; scenes: ObsScene[]; musicInputs: string[]; inputSources: ObsInput[]; program: string | null; preview: string | null; streaming: boolean; recording: boolean; streamTimecode: string; studioMode: boolean; lastError: string | null };
