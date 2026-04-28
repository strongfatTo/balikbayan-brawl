# Balikbayan Brawl Version Checkpoints

## V1 - Initial Commit

Git commit for V1:
- `ca6e76bfa44259c7c8557cd2161e9920e59e26ef`

This checkout is the first version of the game. It already contains the full core experience needed to host and test the project locally.

Purpose of V1:
- Define the basic player loop: enter name, pack the box, place items, and fight.
- Keep the first version simple so the main mechanic is easy to test.
- Use this version to confirm the game flow before adding more rules or polish.

What V1 has:
- A title screen and game intro flow.
- Player login with a name input.
- Room join and room create options for multiplayer.
- An AI battle option for solo testing.
- A shopping phase where players build a box on a 5x5 grid.
- A budget system for choosing items.
- Item placement and removal controls.
- Item rules and stat display for strategy play.
- A battle phase that shows team lists, battle grid views, and battle log feedback.
- A leaderboard and tournament flow for longer matches.

What V1 is good for:
- Checking that the game can run locally.
- Testing the main pack-to-battle loop.
- Seeing the original gameplay before later polish, tutorial, and drag-and-drop changes.

Feedback gathered for V2:
- Players need clearer guidance on how to pack the box and where items should go.
- Item placement needs stronger visual feedback so the board feels easier to understand.
- The fight start should feel clearer, so the transition from packing to battle is more obvious.
- The basic loop works, but it needs better rules, balance, and presentation in the next version.

Suggested V1 git label:
- `v1-initial-commit`

## V2 - Shop Expansion

Git commit for V2:
- `e6dd467`

This version is the first big gameplay expansion after the prototype. It makes the shop loop feel more complete and gives players more ways to build and manage a box.

Purpose of V2:
- Expand the shop into a more replayable system.
- Add more items and more ways to recover from a bad build.
- Make the packing phase feel less bare and more like a full game loop.

What V2 adds:
- Shop restock.
- Sell box / refund behavior.
- New items and broader item variety.
- Wallet animation and stronger shopping feedback.
- Battle-side updates that support the new item set.

Why V2 matters:
- It is the first checkpoint where the game starts feeling like a real build-and-manage strategy game instead of only a basic prototype.
- It adds the systems needed for more interesting playtest feedback.

## V3 - Guide Update + Game Balance

Git commit for V3:
- `4e39f1d`

This version combines the stronger tutorial/guide flow with the earlier item balance pass. It makes the game easier to learn while keeping the box-building strategy deeper and more readable.

Purpose of V3:
- Give players a clearer guide for learning the packing loop.
- Keep the balanced item system in place while improving readability.
- Make the game easier to understand without removing the strategic decisions.

What V3 changes:
- Guided tutorial mode with overlay and step-by-step instructions.
- Structured tutorial steps and item rotation guidance.
- Updated item stats and shapes from the balance pass.
- Moving item functionality and more strategic packing behavior.

Why V3 matters:
- This is the first checkpoint where the game clearly teaches the player while also keeping the balance work in place.
- It is a better fit for a mid-project version than the smaller multiplayer refactor commit.

## Final Version - Drag-and-Drop Build

Git commit for the final version:
- `d81cbcc`

This is the latest version of the game on the main branch. It is the most complete build in the current history and adds the polished interaction style for placing items on the grid.

Purpose of the final version:
- Turn the packing phase into a smoother drag-and-drop experience.
- Reduce friction between selecting items and placing them on the board.
- Make the game feel closer to the finished version players should test and play repeatedly.

What the final version changes:
- Pointer-based drag-and-drop for placed items and grid placement.
- Stronger interaction flow for moving items around the board.
- Final UI polish that supports the improved packing experience.
- The latest mainline codebase used for hosting and testing.

Why the final version matters:
- It is the most advanced checkpoint in the current git history.
- It represents the end-state build after the guide, balance, and multiplayer work.
- It is the version to use when you want the latest playable experience rather than an earlier milestone.
