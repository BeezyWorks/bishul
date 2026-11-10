# [2.11.0](https://github.com/BeezyWorks/tavshil/compare/v2.10.0...v2.11.0) (2026-11-10)


### Features

* **app:** click a selected saved filter to clear it; edit and delete saved filters ([e9ebc3b](https://github.com/BeezyWorks/tavshil/commit/e9ebc3b592f6bdbae2fe5c978a7052b96780e2f1))

# [2.10.0](https://github.com/BeezyWorks/tavshil/compare/v2.9.1...v2.10.0) (2026-11-10)


### Bug Fixes

* **app:** drop the active-count chip from the recipe filters header ([368a089](https://github.com/BeezyWorks/tavshil/commit/368a0899c0581dc95413eb615519ef7a65010a67))
* **app:** keep the recipe Filters chip from stretching full width ([8ba3583](https://github.com/BeezyWorks/tavshil/commit/8ba3583937aaf67d7c20994d9ceba523c32c07cb))
* **app:** one header for saving a recipe filter; segmented control scrolls on small screens ([fddbf54](https://github.com/BeezyWorks/tavshil/commit/fddbf54caf912ea8bea9e2f656b332e97d223543))
* **app:** wrap page action buttons on phones, clearer back link, שבת as the weekday ([f35706e](https://github.com/BeezyWorks/tavshil/commit/f35706ee087afac58cb14c17d344c7d1117db914))


### Features

* **app:** group menus as main, sides and dessert, with drag and drop, icons and square buttons ([176baf0](https://github.com/BeezyWorks/tavshil/commit/176baf050b1738b1ebc1f378012ee9bcbef6b819))
* **app:** make recipe filters a collapsible header ([14c8bdf](https://github.com/BeezyWorks/tavshil/commit/14c8bdf161f0cce013b8ee38080dcb20d28531f2))
* **app:** quick edits on the recipe page, equipment add, optimistic reactions ([192986e](https://github.com/BeezyWorks/tavshil/commit/192986e8993aff4c2d17ee78f7d26019386cf4ae))
* **app:** say what saving a recipe filter does and confirm it ([4950ceb](https://github.com/BeezyWorks/tavshil/commit/4950cebe060a2fea091b4e70c36c7d585f4ed78e))
* **app:** show saved recipe filters in a labelled row inside the Filters card ([ddf2954](https://github.com/BeezyWorks/tavshil/commit/ddf29547e2514cf4b3b3d41d3ede79ceecc0305e))
* **app:** tidy the host plan page and parse loose meal times ([e493170](https://github.com/BeezyWorks/tavshil/commit/e4931709b037cc8e8ddfb1102efe85856506b6d3))
* **app:** unfold and fold the recipe filters panel ([32234d3](https://github.com/BeezyWorks/tavshil/commit/32234d3518ba0d6744ce11fa8c3b18badf8ef96c))


### Performance Improvements

* **app:** show plan menu and guest edits at once ([064f14d](https://github.com/BeezyWorks/tavshil/commit/064f14dc492254cf24f3c6c02763638e5589b3a9))

## [2.9.1](https://github.com/BeezyWorks/tavshil/compare/v2.9.0...v2.9.1) (2026-11-10)


### Bug Fixes

* **app:** stop recipes crashing on cached data without source links ([55851b7](https://github.com/BeezyWorks/tavshil/commit/55851b7614cad20264647dd8ab39780a988ec3ee))

# [2.9.0](https://github.com/BeezyWorks/tavshil/compare/v2.8.0...v2.9.0) (2026-11-10)


### Features

* **app:** edit several original-recipe links per version, with video links labelled ([0a74845](https://github.com/BeezyWorks/tavshil/commit/0a74845bb5d9d3adddc2fde02bc5bdeb2dbbfa67))

# [2.8.0](https://github.com/BeezyWorks/tavshil/compare/v2.7.0...v2.8.0) (2026-11-10)


### Features

* **worker:** live public recipes, author from profile, MCP coverage ([70e1681](https://github.com/BeezyWorks/tavshil/commit/70e16810bb2efb8a1c25655b59187ddefe0a40ec))

# [2.7.0](https://github.com/BeezyWorks/tavshil/compare/v2.6.0...v2.7.0) (2026-11-10)


### Bug Fixes

* **app:** resolve expo-keep-awake peers in the lockfile ([5d77793](https://github.com/BeezyWorks/tavshil/commit/5d7779300c36112ed833d057c138d4cb746e707b))


### Features

* **app:** cook-mode timer redesign, looping alarm with chosen sound, keep-awake setting ([a16f336](https://github.com/BeezyWorks/tavshil/commit/a16f336d6af35f822b922c27a388f54d23f27139))
* **worker:** public recipes with search, ratings, save-a-copy and anonymous authors ([17256e7](https://github.com/BeezyWorks/tavshil/commit/17256e7fed5ab4bdb53119a12432f71d19eb0f6a))

# [2.6.0](https://github.com/BeezyWorks/tavshil/compare/v2.5.0...v2.6.0) (2026-11-09)


### Bug Fixes

* **app:** hide recipe list until typing in the day editor; shrink add-tag button ([bdc2266](https://github.com/BeezyWorks/tavshil/commit/bdc2266b86e083f5c3610548a7391f8f57972499))


### Features

* **app:** iOS Live Activity for cook timers ([4063d87](https://github.com/BeezyWorks/tavshil/commit/4063d873911fe8b48c874eb8993dea75252f6d04))

# [2.5.0](https://github.com/BeezyWorks/tavshil/compare/v2.4.0...v2.5.0) (2026-11-09)


### Bug Fixes

* **app:** set the App Store Connect app id for Tavshil ([321c243](https://github.com/BeezyWorks/tavshil/commit/321c243c90c1adde7baadcae3f71d2767782ffe6))
* rename deploy script to deploy:prod (pnpm deploy is a built-in) ([17d3344](https://github.com/BeezyWorks/tavshil/commit/17d334479406b54b1b36b4f4ba8c07a77521c4d2))


### Features

* **app:** simplify the meal editor, instant recipe list, Hebrew-only day label ([be80aae](https://github.com/BeezyWorks/tavshil/commit/be80aae7d45a77d761be423927dc7a21abc1a1f4))
* spicy and kid friendly are tags; add a tag from the recipe page ([c9d99d9](https://github.com/BeezyWorks/tavshil/commit/c9d99d99f3bbb0abafa2a54ebda2f97733938cca))
* timer editing in the link editor, tell the MCP to set step timers ([0501ebf](https://github.com/BeezyWorks/tavshil/commit/0501ebf0194f75e37c6ac7ca3c0f72f62b3fbd20))
* timer label and half-minute stepper in the link editor ([2a18be1](https://github.com/BeezyWorks/tavshil/commit/2a18be1d832416019e750455db8db7a7560e9f06))


### Performance Improvements

* optimistic updates and a faster shopping list ([10dd75e](https://github.com/BeezyWorks/tavshil/commit/10dd75eb37cbc38411275a6d241cf1f97a9ae875))

# [2.4.0](https://github.com/BeezyWorks/bishul/compare/v2.3.0...v2.4.0) (2026-11-09)


### Bug Fixes

* **app:** respect iOS safe areas on screens, nav and cooking mode ([77ee9b2](https://github.com/BeezyWorks/bishul/commit/77ee9b2423f3b5b82df26e8bb462cf2d7e18154e))
* **app:** use branded Apple and Google sign-in buttons ([e87ae35](https://github.com/BeezyWorks/bishul/commit/e87ae353852fee2c7a9029e631f77ea97fb416c9))


### Features

* **app:** keep the query cache on the device so screens open offline ([f84795d](https://github.com/BeezyWorks/bishul/commit/f84795d478091708fc270f74313e7cff5a7e174e))
* search recipes by nutrition and tags, require servings ([2b9e449](https://github.com/BeezyWorks/bishul/commit/2b9e449604ff9b2228be217e8347b481965739de))

# [2.3.0](https://github.com/BeezyWorks/bishul/compare/v2.2.1...v2.3.0) (2026-11-09)


### Features

* rename the app to Tavshil ([8bfa39c](https://github.com/BeezyWorks/bishul/commit/8bfa39cade3a84676f2278804f1257acdc17a1f3))


### Performance Improvements

* **worker:** share session checks across isolates through the colo cache ([8c08fe6](https://github.com/BeezyWorks/bishul/commit/8c08fe607048917244ff03d13bfe96df9c08cacb))

## [2.2.1](https://github.com/BeezyWorks/bishul/compare/v2.2.0...v2.2.1) (2026-11-09)


### Bug Fixes

* **app:** set the App Store Connect app id and team for TestFlight submits ([3362e7f](https://github.com/BeezyWorks/bishul/commit/3362e7f5012b8a8308cde2acef7af5dc50f3a12a))

# [2.2.0](https://github.com/BeezyWorks/bishul/compare/v2.1.0...v2.2.0) (2026-11-09)


### Features

* **app:** Google and Apple sign-in on iOS, tagged releases and pnpm ship ([8ddf591](https://github.com/BeezyWorks/bishul/commit/8ddf591f4a30c8eca6d36273a67c9715e5cd677a))
* **app:** iOS build setup, PWA icons and manifest, native storage and API origin ([46914cb](https://github.com/BeezyWorks/bishul/commit/46914cb9d812ac43b9488b550c4983185e54979e))
* **cook:** step timers with notifications and hour-aware clock ([ea07773](https://github.com/BeezyWorks/bishul/commit/ea0777356c4726095931541dd4021ce7339950ac))
* **recipes:** add icons to the recipe screen action buttons ([a9d2352](https://github.com/BeezyWorks/bishul/commit/a9d23524ef1957973244fde613c9cc12cf2bf293))
* **recipes:** show nutrition below the steps on the recipe screen ([a39d388](https://github.com/BeezyWorks/bishul/commit/a39d388fa8f4738eeea9663a7c9aa25c019c6425))


### Performance Improvements

* **app:** start signed in from the cached user ([9293378](https://github.com/BeezyWorks/bishul/commit/9293378f254512bb0478f17bfae45485be3d81f0))
* **plan:** load a week's meal facts in batched queries ([bf9778c](https://github.com/BeezyWorks/bishul/commit/bf9778cf6b2bd97ae856ec99df520dc5492a9a61))
