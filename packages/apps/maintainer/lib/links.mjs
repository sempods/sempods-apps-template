// Checks links and heading anchors in every Markdown file of the repository,
// locally and without network access. It drives remark-validate-links through
// unified-engine directly, the engine behind remark's CLI, without the CLI's
// file watcher and its dependencies.
import markdownExtensions from 'markdown-extensions';
import { remark } from 'remark';
import remarkValidateLinks from 'remark-validate-links';
import { engine } from 'unified-engine';

/** Resolves to true when every Markdown link resolves; reports problems on stderr. */
export function checkLinks(root) {
  return new Promise((resolve, reject) => {
    engine(
      {
        processor: remark(),
        cwd: root,
        files: ['.'],
        // The same suffixes remark's CLI expands: .md, .markdown, .mdown and more.
        extensions: markdownExtensions,
        ignoreName: '.remarkignore',
        // The packed snapshot repeats the shared files, whose links resolve
        // from the repository root only.
        ignorePatterns: ['packages/apps/shared/**'],
        // Without a repository, links are checked as local files only; the
        // engine does not ask git for a remote.
        plugins: [[remarkValidateLinks, { repository: false }]],
        detectConfig: false,
        quiet: true,
        frail: true,
        out: false,
        output: false,
        color: false,
      },
      (error, code) => (error ? reject(error) : resolve(code === 0)),
    );
  });
}
