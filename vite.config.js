import { defineConfig } from 'vite';

function getBasePath() {
  if (process.env.BASE_PATH) {
    return process.env.BASE_PATH;
  }

  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) {
    return '/';
  }

  const repoName = repository.split('/')[1] || '';
  return repoName.endsWith('.github.io') ? '/' : `/${repoName}/`;
}

export default defineConfig({
  base: getBasePath(),
  assetsInclude: ['**/*.glb'],
  build: {
    assetsInlineLimit: 0
  }
});
