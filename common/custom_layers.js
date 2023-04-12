class CustomLayers {
    #custom_layers = new Map();
    #custom_layer_controls;
    #edit_mode = false;
    #interactive_map;
    #map;
    #website_subdir;

    /**
     * Add custom editable layers to the map. Loads and saves them to local storage.
     * @param {InteractiveMap} interactive_map The interactive map this gets added to
     */
    constructor(interactive_map) {
        this.#map = interactive_map.getMap();
        this.#interactive_map = interactive_map;
        this.#website_subdir = interactive_map.getWebsiteSubdir();

        this.#loadFromStorage();

        this.#extendDefaultLayerControl(this.#map);
        this.#custom_layer_controls = new L.Control.Layers(null, Object.fromEntries(this.#custom_layers), {
            collapsed: false
        });

        // Save manual edits before leaving
        window.onbeforeunload = this.#saveToStorage.bind(this);
        // The unload method seems sometimes unreliable so also save every 5 minutes
        window.setInterval(this.#saveToStorage.bind(this), 300000);
    }

    /**
     * Show custom layers on the map. This needs the display names!
     * @param {string[]} layers Array of display names of layers to add
     */
    addLayersToMap(layers) {
        layers.forEach(layer => {
            if (this.#hasLayer(layer)) {
                this.#map.addLayer(this.#getLayer(layer));
            }
        });
    }

    /**
     * Create a new custom layer. If currently in edit mode also switch directly to it.
     * @returns {boolean} Success or not
     */
    createLayer() {
        var active_layer = this.#getActiveLayer();

        var layer_id = prompt("Unique new layer name");

        if (layer_id == null || layer_id == '' || layer_id in this.#custom_layers) {
            return false;
        }

        var new_layer = L.featureGroup(null, {
            pmIgnore: false
        });

        this.#custom_layers.set(layer_id, new_layer);

        // Refresh layer to controls
        this.#custom_layer_controls.addOverlay(new_layer, layer_id);

        // Display new layer and active
        new_layer.addTo(this.#map);

        this.#map.pm.setGlobalOptions({
            layerGroup: new_layer,
            markerStyle: {
                icon: Utils.getCustomIcon(layer_id.substring(0, 2))
            }
        });

        this.#interactive_map.addUserLayer(layer_id);

        if (this.isInEditMode()) {
            this.#interactive_map.removeUserLayer(this.#getActiveLayerId());
            this.#switchLayer(active_layer, new_layer);
        }

        return true;
    }

    /**
     * Disable the editing mode.
     */
    disableEditing() {
        L.PM.setOptIn(true);

        var active_layer = this.#getActiveLayer();
        if (active_layer) {
            L.PM.reInitLayer(active_layer);
        }

        this.#map.pm.disableDraw();
        this.#map.pm.disableGlobalEditMode();
        this.#map.pm.disableGlobalDragMode();
        this.#map.pm.disableGlobalRemovalMode();
        this.#map.pm.disableGlobalCutMode();
        this.#map.pm.disableGlobalRotateMode();
        this.#map.pm.toggleControls();

        this.#edit_mode = false;
        this.updateControls();
        this.#map.off('pm:create');
        this.#interactive_map.getShareMarker().turnOn();
    }

    /**
     * Enable the editing mode.
     * @returns Nothing
     */
    enableEditing() {
        if (this.#getActiveLayerCount() < 1) {
            if (!this.createLayer()) {
                return;
            }
        } else if (this.#getActiveLayerCount() > 1) {
            alert('Please select only one custom layer to edit');
            return;
        }

        var active_layer = this.#getActiveLayer();
        if (!active_layer) {
            return;
        }

        // Enable general editing for new markers
        L.PM.setOptIn(false);
        L.PM.reInitLayer(active_layer);

        this.#map.pm.toggleControls();
        this.#map.pm.setGlobalOptions({
            layerGroup: active_layer,
            markerStyle: {
                icon: Utils.getCustomIcon(this.#getActiveLayerId().substring(0, 2))
            }
        });

        this.#edit_mode = true;
        this.#hideControls();
        /*this.#interactive_map.getShareMarker().turnOff();*/
        Utils.setHistoryState(undefined, undefined, this.#website_subdir);

        this.#map.on('pm:create', event => {
            this.#createPopup(event.layer);
        });
    }

    /**
     * Export the currently active custom layer to a downloadable file.
     * @returns Nothing
     */
    exportLayer() {
        var active_layer = this.#getActiveLayer();

        if (!active_layer) {
            return;
        }

        Utils.download(this.#getActiveLayerId() + '.json', JSON.stringify(active_layer.toGeoJSON(), null, '    '));
    }

    /**
     * Check if the edit mode is currently active.
     * @returns {boolean} The current edit mode status
     */
    isInEditMode() {
        return this.#edit_mode;
    }

    /**
     * Show or hide the custom layer control box to the map.
     */
    updateControls() {
        if (this.#getLayerCount() > 0) {
            this.#showControls();
        } else {
            this.#hideControls();
        }
    }

    /**
     * Remove a custom layer
     * @returns Nothing
     */
    removeLayer() {
        if (!this.isInEditMode()) {
            return;
        }

        if (!confirm('Really delete the current custom marker layer?')) {
            return;
        }

        // should be only one because we're in edit mode
        var active_layer = this.#getActiveLayer();

        if (active_layer) {
            var active_layer_id = this.#getActiveLayerId();
            localStorage.removeItem(`${this.#website_subdir}:${active_layer_id}`);
            this.#custom_layer_controls.removeLayer(active_layer);
            this.#map.removeLayer(active_layer);
            this.#custom_layers.delete(active_layer_id);

            // Manually trigger the events that should fire in 'overlayremove'
            this.#interactive_map.removeUserLayer(active_layer_id);
        }

        this.disableEditing();
    }


    /**
     * Add an edit popup to a layer.
     * @param {L.Layer} layer The layer to add to
     */
    #createPopup(layer) {
        layer.bindPopup(() => {
            var html = document.createElement('div');
            var id_p = document.createElement('p');

            var id_input = document.createElement('input');
            id_input.setAttribute('type', 'text');
            id_input.id = layer._leaflet_id + ':id';

            var id_label = document.createElement('label');
            id_label.htmlFor = id_input.id;
            id_label.innerHTML = 'ID: ';

            if (!layer.feature) {
                layer.feature = {};
                layer.feature.type = 'Feature';
            }

            if (!layer.feature.properties) {
                layer.feature.properties = {};
            }

            if (layer.feature.properties.id) {
                id_input.value = layer.feature.properties.id;
            }

            id_input.addEventListener('change', event => {
                layer.feature.properties.id = event.target.value;
            });

            id_p.appendChild(id_label);
            id_p.appendChild(id_input);
            html.appendChild(id_p);

            var name_p = document.createElement('p');

            var name_input = document.createElement('input');
            name_input.setAttribute('type', 'text');
            name_input.id = layer._leaflet_id + ':name';

            var name_label = document.createElement('label');
            name_label.htmlFor = name_input.id;
            name_label.innerHTML = 'Name: ';

            if (layer.feature.properties.name) {
                name_input.value = layer.feature.properties.name;
            }

            name_input.addEventListener('change', event => {
                layer.feature.properties.name = event.target.value;
            });

            name_p.appendChild(name_label);
            name_p.appendChild(name_input);
            html.appendChild(name_p);

            var image_url_p = document.createElement('p');

            var image_url_input = document.createElement('input');
            image_url_input.setAttribute('type', 'text');
            image_url_input.id = layer._leaflet_id + ':image_url';

            var image_url_label = document.createElement('label');
            image_url_label.htmlFor = image_url_input.id;
            image_url_label.innerHTML = 'Image ID: ';

            if (layer.feature.properties.image_url) {
                image_url_input.value = layer.feature.properties.image_url;
            }

            image_url_input.addEventListener('change', event => {
                layer.feature.properties.image_url = event.target.value;
            });

            image_url_p.appendChild(image_url_label);
            image_url_p.appendChild(image_url_input);
            html.appendChild(image_url_p);

            var video_id_p = document.createElement('p');

            var video_id_input = document.createElement('input');
            video_id_input.setAttribute('type', 'text');
            video_id_input.id = layer._leaflet_id + ':video_id';

            var video_id_label = document.createElement('label');
            video_id_label.htmlFor = video_id_input.id;
            video_id_label.innerHTML = 'Video ID: ';

            if (layer.feature.properties.video_id) {
                video_id_input.value = layer.feature.properties.video_id;
            }

            video_id_input.addEventListener('change', event => {
                layer.feature.properties.video_id = event.target.value;
            });

            video_id_p.appendChild(video_id_label);
            video_id_p.appendChild(video_id_input);
            html.appendChild(video_id_p);

            var description_p = document.createElement('p');

            var description_input = document.createElement('input');
            description_input.setAttribute('type', 'text');
            description_input.id = layer._leaflet_id + ':description';

            var description_label = document.createElement('label');
            description_label.htmlFor = description_input.id;
            description_label.innerHTML = 'Description: ';

            if (layer.feature.properties.description) {
                description_input.value = layer.feature.properties.description;
            }

            description_input.addEventListener('change', event => {
                layer.feature.properties.description = event.target.value;
            });

            description_p.appendChild(description_label);
            description_p.appendChild(description_input);
            html.appendChild(description_p);

            /* Tags Function */
            function editTags(checkedBool, tagStr) {
                if (checkedBool) {
                    if (layer.feature.properties.tags == null || layer.feature.properties.tags == 'undefined' || layer.feature.properties.tags == '') {
                        layer.feature.properties.tags = tagStr;
                    } else {
                        layer.feature.properties.tags += ","+tagStr;
                    };
                } else {
                    if (layer.feature.properties.tags.match(','+tagStr) != null) {
                        layer.feature.properties.tags = layer.feature.properties.tags.replace(',' + tagStr, "");
                    } else if (layer.feature.properties.tags.match(tagStr + ',') != null) {
                        layer.feature.properties.tags = layer.feature.properties.tags.replace(tagStr + ',', "");
                    } else if (layer.feature.properties.tags.match(tagStr) != null) {
                        layer.feature.properties.tags = layer.feature.properties.tags.replace(tagStr, "");
                    };
                }
        
                console.log(layer.feature.properties.tags);
                console.log(checkedBool);
            }

            /* Tags Input */
            if (!layer.feature.properties.tags) {
                layer.feature.properties.tags = ""
            }
            /* Cliff */
            var cliff_p = document.createElement('p');

            var hightcliff_input = document.createElement('input');
            hightcliff_input.type = 'checkbox';

            var hc_label = document.createElement('label');
            hc_label.innerHTML = 'High Cliff:';

            if (layer.feature.properties.tags.match("High Cliff") != null) {
                hightcliff_input.checked = true;
            }

            hightcliff_input.addEventListener('change', event => {editTags(event.target.checked, "High Cliff");});

            var smallcliff_input = document.createElement('input');
            smallcliff_input.type = 'checkbox';

            var sc_label = document.createElement('label');
            sc_label.innerHTML = "Small Cliff:";

            if (layer.feature.properties.tags.match("Small Cliff") != null) {
                smallcliff_input.checked = true;
            }

            smallcliff_input.addEventListener('change', event => {editTags(event.target.checked, "Small Cliff");});

            cliff_p.appendChild(hc_label);
            cliff_p.appendChild(hightcliff_input);
            cliff_p.appendChild(sc_label);
            cliff_p.appendChild(smallcliff_input);
            html.appendChild(cliff_p);

            /* Height */
            var height_p = document.createElement('p');

            var sealevel_input = document.createElement('input');
            sealevel_input.type = 'checkbox';

            if (layer.feature.properties.tags.match("Sea Level") != null) {
                sealevel_input.checked = true;
            }

            sealevel_input.addEventListener('change', event => {editTags(event.target.checked, "Sea Level");});

            var sl_label = document.createElement('label');
            sl_label.innerHTML = "Sea Level:";

            var decentheight_input = document.createElement('input');
            decentheight_input.type = 'checkbox';

            if (layer.feature.properties.tags.match("Decent Height") != null) {
                decentheight_input.checked = true;
            }

            decentheight_input.addEventListener('change', event => {editTags(event.target.checked, "Decent Height");});

            var dh_label = document.createElement('label');
            dh_label.innerHTML = "Decent Height:";

            height_p.appendChild(sl_label);
            height_p.appendChild(sealevel_input);
            height_p.appendChild(dh_label);
            height_p.appendChild(decentheight_input);
            html.appendChild(height_p);

            /* Distance */

            var distance_p = document.createElement('p');

            var afewpaces_input = document.createElement('input');
            afewpaces_input.type = 'checkbox';

            if (layer.feature.properties.tags.match("A few paces") != null) {
                afewpaces_input.checked = true;
            }

            afewpaces_input.addEventListener('change', event => {editTags(event.target.checked, "A few paces");});

            var afp_label = document.createElement('label');
            afp_label.innerHTML = "A few paces:";

            var haflway_input = document.createElement('input');
            haflway_input.type = 'checkbox';

            if (layer.feature.properties.tags.match("Half-way") != null) {
                haflway_input.checked = true;
            }

            haflway_input.addEventListener('change', event => {editTags(event.target.checked, "Half-way");});

            var hw_label = document.createElement('label');
            hw_label.innerHTML = "Half-way:";

            var edge_input = document.createElement('input');
            edge_input.type = 'checkbox';

            if (layer.feature.properties.tags.match("Edge/Near Sea") != null) {
                edge_input.checked = true;
            }

            edge_input.addEventListener('change', event => {editTags(event.target.checked, "Edge/Near Sea");});

            var edge_label = document.createElement('label');
            edge_label.innerHTML = "Edge/Near Sea:";

            distance_p.appendChild(afp_label);
            distance_p.appendChild(afewpaces_input);
            distance_p.appendChild(hw_label);
            distance_p.appendChild(haflway_input);
            distance_p.appendChild(edge_label);
            distance_p.appendChild(edge_input);
            html.appendChild(distance_p);

            /* Material */

            var material_p = document.createElement('p');

            var ground_input = document.createElement('input');
            ground_input.type = 'checkbox';

            if (layer.feature.properties.tags.match("Ground") != null) {
                ground_input.checked = true;
            }

            ground_input.addEventListener('change', event => {editTags(event.target.checked, "Ground");});

            var ground_label = document.createElement('label');
            ground_label.innerHTML = "Ground:";

            var sand_input = document.createElement('input');
            sand_input.type = 'checkbox';

            if (layer.feature.properties.tags.match("Sand") != null) {
                sand_input.checked = true;
            }

            sand_input.addEventListener('change', event => {editTags(event.target.checked, "Sand");});

            var sand_label = document.createElement('label');
            sand_label.innerHTML = "Sand:";

            var snow_input = document.createElement('input');
            snow_input.type = 'checkbox';

            if (layer.feature.properties.tags.match("Snow") != null) {
                snow_input.checked = true;
            }

            snow_input.addEventListener('change', event => {editTags(event.target.checked, "Snow");});

            var snow_label = document.createElement('label');
            snow_label.innerHTML = "Snow:";

            material_p.appendChild(ground_label);
            material_p.appendChild(ground_input);
            material_p.appendChild(sand_label);
            material_p.appendChild(sand_input);
            material_p.appendChild(snow_label);
            material_p.appendChild(snow_input);
            html.appendChild(material_p);

            /* Clear Tag Input */
            var clearTags_p = document.createElement('p');

            var clearTags_input = document.createElement('input');
            clearTags_input.type = 'button';
            clearTags_input.value = "Clear All Tags";

            clearTags_input.addEventListener('click', event => {

                hightcliff_input.checked = false
                smallcliff_input.checked = false
                sealevel_input.checked = false
                decentheight_input.checked = false
                afewpaces_input.checked = false
                haflway_input.checked = false
                edge_input.checked = false
                ground_input.checked = false
                sand_input.checked = false
                snow_input.checked = false

                layer.feature.properties.tags = ""
            })

            clearTags_p.appendChild(clearTags_input);
            html.appendChild(clearTags_p);

            return html;
        });

        /*
        layer.on('popupopen', event => {
            Utils.setHistoryState(undefined, undefined, this.#website_subdir);
            this.#interactive_map.getShareMarker().removeMarker();
        });
        
        layer.on('popupclose', event => {
            if (this.isInEditMode()) return;

            this.#interactive_map.getShareMarker().prevent();
        });
        */
    }

    /**
     * Workaround to get active layers from a control
     * @param {L.Map} map The map
     */
    // https://stackoverflow.com/a/51484131
    #extendDefaultLayerControl(map) {
        // Add method to layer control class
        L.Control.Layers.include({
            getOverlays: function (args = {}) {
                var defaults = {
                    only_active: false
                };
                var params = { ...defaults, ...args } // right-most object overwrites

                // create hash to hold all layers
                var control, layers;
                layers = {};
                control = this;

                // loop thru all layers in control
                control._layers.forEach(function (obj) {
                    var layerName;

                    // check if layer is an overlay
                    if (obj.overlay) {
                        // get name of overlay
                        layerName = obj.name;
                        // store whether it's present on the map or not
                        if (params.only_active && !map.hasLayer(obj.layer)) {
                            return;
                        }
                        return layers[layerName] = map.hasLayer(obj.layer);
                    }
                });

                return layers;
            }
        });
    }

    /**
     * Get the currently active custom layer if only one is active.
     * @returns {L.Layer | undefined} Layer
     */
    #getActiveLayer() {
        if (this.#getActiveLayerCount() != 1) {
            return undefined;
        }

        return this.#custom_layers.get(this.#getActiveLayerId());
    }

    /**
     * Get the count of currently active custom layers
     * @returns {num} Count
     */
    #getActiveLayerCount() {
        var active_layers = this.#custom_layer_controls.getOverlays({
            only_active: true
        });

        return Object.keys(active_layers).length;
    }

    /**
     * Get the ID of the currently active custom layer
     * @returns {string} ID (== name for custom layers)
     */
    #getActiveLayerId() {
        var active_layers = this.#custom_layer_controls.getOverlays({
            only_active: true
        });

        return Object.keys(active_layers)[0];
    }

    /**
     * Get a custom layer.
     * @param {string} id ID (== name) of the custom layer
     * @returns {L.Layer} Layer
     */
    #getLayer(id) {
        return this.#custom_layers.get(id);
    }

    /**
     * Get the custom layer count.
     * @returns {int} Count
     */
    #getLayerCount() {
        return this.#custom_layers.size;
    }

    /**
     * Check if the custom layer exists.
     * @param {string} id ID (== name) of the custom layer
     * @returns {boolean} True or false
     */
    #hasLayer(id) {
        return this.#custom_layers.has(id);
    }

    /**
     * Hide the custom layer controls
     */
    #hideControls() {
        this.#map.removeControl(this.#custom_layer_controls);
    }

    /**
     * Load the current custom layer state from local storage.
     */
    #loadFromStorage() {
        if (localStorage.getItem(`${this.#website_subdir}:custom_layers`)) {
            JSON.parse(localStorage.getItem(`${this.#website_subdir}:custom_layers`)).forEach(id => {
                if (!localStorage.getItem(`${this.#website_subdir}:${id}`)) {
                    return;
                }

                var geojson = JSON.parse(localStorage.getItem(`${this.#website_subdir}:${id}`));

                var geojson_layer = L.geoJSON(geojson, {
                    pointToLayer: (feature, latlng) => {
                        return L.marker(latlng, {
                            icon: Utils.getCustomIcon(id.substring(0, 2)),
                            riseOnHover: true
                        });
                    },
                    onEachFeature: (feature, l) => {
                        this.#createPopup(l);
                    },
                    pmIgnore: false
                });
                this.#custom_layers.set(id, geojson_layer);
            });
        }
    }

    /**
     * Save the current custom layer state to local storage.
     * @returns Nothing
     */
    #saveToStorage() {
        var array = new Array();

        if (this.#getLayerCount() < 1) {
            localStorage.removeItem(`${this.#website_subdir}:custom_layers`);
            return;
        }

        this.#custom_layers.forEach((layer, id) => {
            localStorage.setItem(`${this.#website_subdir}:${id}`, JSON.stringify(layer.toGeoJSON()));
            array.push(id);
        });

        localStorage.setItem(`${this.#website_subdir}:custom_layers`, JSON.stringify(array));
    }

    /**
     * Show the custom layer controls.
     */
    #showControls() {
        // Don't know why I have to create a new control but adding the old one is giving me an exception
        this.#custom_layer_controls = new L.Control.Layers(null, Object.fromEntries(this.#custom_layers), {
            collapsed: false
        });

        this.#map.addControl(this.#custom_layer_controls);
    }

    /**
     * Switch the currently active custom layer.
     * @param {L.Layer} old_layer Old Layer
     * @param {L.Layer} new_layer New layer
     */
    #switchLayer(old_layer, new_layer) {
        // We should be in edit mode here
        this.#map.off('pm:create');

        // Disable current active layer
        this.#map.removeLayer(old_layer);
        L.PM.setOptIn(true);
        L.PM.reInitLayer(old_layer);

        L.PM.setOptIn(false);
        L.PM.reInitLayer(new_layer);

        this.#map.on('pm:create', event => {
            this.#createPopup(event.layer);
        });
    }
}
