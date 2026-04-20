---
title: MouseInterceptor
description: Lightweight UE plugin for global mouse event interception with customisable double-click detection.
---

**Mouse Interceptor** is a lightweight Unreal Engine plugin designed for global
interception of mouse events. It lets you seamlessly handle mouse button
presses and releases, along with customisable double-click detection. All
events are exposed via delegates — Blueprint integration in a few nodes.

> Full Russian docs: see [the Russian version](/plugins/mouseinterceptor/).

## Key features

- **Global mouse event interception** — capture all mouse events globally,
  regardless of the active interface or input state.
- **Customisable double-click detection** — configure the time threshold for
  detecting double-clicks dynamically via Blueprints.
- **Blueprint integration** — handle mouse events easily through the
  `OnMousePressed` and `OnMouseReleased` delegates.
- **Lightweight and efficient** — operates without Tick, ensuring minimal
  performance overhead.

## Supported platforms

Development and target: Windows 64-bit, macOS, Linux.

## Repo

[GitHub → CRAFTCODE-CJD/MouseInterceptor](https://github.com/CRAFTCODE-CJD/MouseInterceptor)
