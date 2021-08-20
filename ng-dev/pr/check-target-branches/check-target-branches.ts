/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {assertValidGithubConfig, getConfig, GithubConfig} from '../../utils/config';
import {error, info, red} from '../../utils/console';
import {GitClient} from '../../utils/git/git-client';
import {assertValidMergeConfig, MergeConfig, TargetLabel} from '../merge/config';
import {
  getBranchesFromTargetLabel,
  getTargetLabelFromPullRequest,
  InvalidTargetLabelError,
} from '../merge/target-label';

async function getTargetBranchesForPr(
  prNumber: number,
  config: {github: GithubConfig; merge: MergeConfig},
) {
  /** Repo owner and name for the github repository. */
  const {owner, name: repo} = config.github;
  /** The singleton instance of the GitClient. */
  const git = GitClient.get();

  /** The current state of the pull request from Github. */
  const prData = (await git.github.pulls.get({owner, repo, pull_number: prNumber})).data;
  /** The list of labels on the PR as strings. */
  // Note: The `name` property of labels is always set but the Github OpenAPI spec is incorrect
  // here.
  // TODO(devversion): Remove the non-null cast once
  // https://github.com/github/rest-api-description/issues/169 is fixed.
  const labels = prData.labels.map((l) => l.name!);
  /** The branch targetted via the Github UI. */
  const githubTargetBranch = prData.base.ref;
  /** The active label which is being used for targetting the PR. */
  let targetLabel: TargetLabel;

  try {
    targetLabel = await getTargetLabelFromPullRequest(config.merge, labels);
  } catch (e) {
    if (e instanceof InvalidTargetLabelError) {
      error(red(e.failureMessage));
      process.exit(1);
    }
    throw e;
  }
  /** The target branches based on the target label and branch targetted in the Github UI. */
  return await getBranchesFromTargetLabel(targetLabel, githubTargetBranch);
}

export async function printTargetBranchesForPr(prNumber: number) {
  const config = getConfig();
  assertValidGithubConfig(config);
  assertValidMergeConfig(config);

  if (config.merge.noTargetLabeling) {
    info(`PR #${prNumber} will merge into: ${config.github.mainBranchName}`);
    return;
  }

  const targets = await getTargetBranchesForPr(prNumber, config);
  info.group(`PR #${prNumber} will merge into:`);
  targets.forEach((target) => info(`- ${target}`));
  info.groupEnd();
}
