// Simple
// Just a simple group of collectibles, trackable in the sidebar

function addRavenna(map) {

    // New layer with id `collectibles` from geoJSON `collectibles`
    map.addInteractiveLayer('Ravenna', ravenna, {

        // The display name for this layer
        name: 'Ravenna',

        // This layer should have a tab in the sidebar with a list for each feature ID
        create_checkbox: true,

        // Each feature should have a popup
        // This internally calls `getPopupMedia()` to associate an image or video
        // See `map_utils.js` for an example
        create_feature_popup: true,

        // This layer should be visible by default
        is_default: true,

        // We don't have created a custom icon so let's use a generic one from Font Awesome
        // Omitting this uses the group icon in `images/icons/${this.id}.png` by default
        // This needs a html string or a function that return a html string
        sidebar_icon_html: '<h style="font-weight:bolder; justify-content: space-around; display: flex">Ra</h>',

        // We don't have created a custom icon so we have to manually provide a marker
        // Omitting this sets a marker with the group icon in `images/icons/${this.id}.png` by default
        // This can include logic based on feature properties
        // https://leafletjs.com/reference.html#geojson-pointtolayer
    });
}
