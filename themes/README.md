# Themes

Each folder here is one Television theme, in the form Television installs. The folder name is the theme ID.

## Install

Copy the folder of a theme into the themes folder of Television, which `tv themes-path` prints, then select the theme by its folder name:

```sh
tv set-theme zen-ink
```

## What a theme folder holds

- `manifest.json`: the display name, version and appearance (`light`, `dark` or `light dark`), as the Television theming guide describes.
- `theme.css`: the stylesheet Television loads after its own.
- `README.md`: the look the theme aims for and the reasons for its decisions.
- `assets/`: any images or fonts the stylesheet loads.

Themes have no build step and no tests. A theme whose assets are generated keeps the script that generates them in its folder, and its README says how to run it.
