# reppit

reppit helps people judge repositories and gives agents task-based access to reusable skills.

## Language

**Item**:
A repository, agent skill, or MCP server that can appear in reppit.
_Avoid_: Post, listing, package

**Feed**:
The shared, ranked stream of items that people browse and filter.
_Avoid_: Marketplace, catalog

**Repo vote**:
A person's judgment that an item works as described or has a named problem. Repo votes affect the item's community signal and ranking.
_Avoid_: Like, reaction

**Downvote reason**:
The required category attached to a negative repo vote: unmaintained, insecure, broken on agent, misleading, or low quality.
_Avoid_: Dislike

**Discussion**:
The comments and replies attached to one item. Discussion helps people explain experience and tradeoffs; it is not an input to item ranking.
_Avoid_: Forum, chat

**Comment vote**:
A person's judgment about whether one comment is useful. Comment votes order discussion only and never change item ranking.
_Avoid_: Repo vote, karma

**Trust score**:
The current health estimate built from measurable repository signals and a bounded repo-vote adjustment.
_Avoid_: Quality score, star score

**Skill recommendation**:
A ranked skill returned for a described task, with its source and the reason it matched.
_Avoid_: Auto-install

**Explicit install**:
An install action requested by a person or agent through an install flag or selected result. A recommendation alone never installs anything.
_Avoid_: Automatic recommendation

**Campaign night**:
One scheduled evening in the 20-day build-in-public campaign, containing a two-post X thread and one figure per post.
_Avoid_: Tweet blast
