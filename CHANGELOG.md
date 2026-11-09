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
