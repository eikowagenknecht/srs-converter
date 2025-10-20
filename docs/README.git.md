# Git Workflow

- Uses GitHub flow with [conventional commits](https://www.conventionalcommits.org/en/v1.0.0/)
- **Branches**: `main` for everything before v1.0.0 is reached, feature branches
- **Commit Types**:
  - `feat`: A new feature (minor version bump)
  - `fix`: A bug fix (patch version bump)
  - `refactor`: A code change that neither fixes a bug nor adds a feature
  - `style`: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)
  - `docs`: Documentation only changes
  - `perf`: A code change that improves performance
  - `test`: Adding missing or correcting existing tests
  - `chore`: Maintenance tasks, dependency updates and other non-user-facing changes
  - `ci`: Changes to the CI configuration files and scripts (GitHub Actions)
  - `revert`: Reverts a previous commit. In the body, it should say: `This reverts commit <hash>.`
- Uses [semantic versioning](https://semver.org/) starting with `v0.1.0` for this library
- Run linter before committing
- Use conventional commits (max 100 chars per line)
- Git hooks are managed by lefthook (see `lefthook.yml`)
- All commits must be signed
