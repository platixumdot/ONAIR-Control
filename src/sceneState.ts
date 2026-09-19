export function getSceneBadgeState(sceneName: string, programScene: string | null, previewScene: string | null) {
  if (sceneName === programScene) return 'program';
  if (sceneName === previewScene) return 'preview';
  return 'scene';
}
