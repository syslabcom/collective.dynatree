/*jslint nomen: true */
/*global jQuery, _, Backbone, document */
(function ($) {
    "use strict"; /*jslint regexp: true */
    _.templateSettings = {
        interpolate: /\{\{(.+?)\}\}/g
    }; /*jslint regexp: false */

    var DataModel = Backbone.Model.extend({
        initialize: function () {
            function change_params(model, params) {
                var real_params = {};
                _.each(params.split('/'), function (param) {
                    var pair = param.split(','),
                        value = pair[1].replace(/^\s+|\s+$/g, "");
                    if (!isNaN(value)) {
                        value = parseInt(value, 10);
                    }
                    if (value === 'True') {
                        value = true;
                    }
                    if (value === 'False') {
                        value = false;
                    }
                    real_params[pair[0].replace(/^\s+|\s+$/g, "")] = value;
                });
                model.set({
                    params: real_params
                }, {
                    silent: true
                });
            }

            _.bindAll(this, "update", "update_selected", "getDataFor");

            this.bind("change:params", change_params);

            this.trigger("change:params", this, this.get("params"));
            $.get(this.get("url"), this.update);
        },
        defaults: {
            sparse: false
        },
        update_selected: function (selected) {
            if (this.get("params").selectMode === 1) { // Single Select
                selected = [_.last(selected)];
            }
            this.set({
                selected: selected
            });
        },
        update: function (result) {
            var new_children = JSON.parse(result),
                new_selected = this.validateSelected(new_children);
            this.set({
                selected: new_selected
            }, {
                silent: true
            });
            this.set({
                children: new_children
            });
        },
        validateSelected: function (new_children) {
            function get_keys(node) {
                return [node.key].concat(_.map(node.children, get_keys));
            }
            var keys = _.flatten(_.map(new_children, get_keys));
            return _.intersection(keys, this.get("selected"));
        },
        getChildren: function () {
            var selected = this.get("selected"),
                filter = this.get("filter") && this.get("filter").toLowerCase(),
                sparse_cache = {},
                retval = this.get("children");

            function map_no_false(elems, filter) {
                return _.without(_.map(elems, filter), false);
            }

            function is_selected_or_has_selected_children(node) {
                if (sparse_cache[node.key] !== undefined) {
                    return sparse_cache[node.key];
                }

                function detect1(selected_key) {
                    return selected_key === node.key;
                }

                function detect2(child) {
                    return is_selected_or_has_selected_children(child);
                }
                if (_.detect(selected, detect1)) {
                    sparse_cache[node.key] = true;
                    return true;
                } else {
                    if (_.detect(node.children, detect2)) {
                        sparse_cache[node.key] = true;
                        return true;
                    }
                }
                sparse_cache[node.key] = false;
                return false;
            }

            function remove_unselected(node) {
                if (!is_selected_or_has_selected_children(node)) {
                    return false;
                }
                var retval = _.clone(node);
                retval.children = map_no_false(retval.children, remove_unselected);
                return retval;
            }

            function remove_non_matching(node) {
                var retval = _.clone(node);
                if (!is_selected_or_has_selected_children(node)) {
                    if (node.title.toLowerCase().indexOf(filter) !== -1) {
                        return retval;
                    } else {
                        retval.children = map_no_false(retval.children, remove_non_matching);
                        if (!(!retval.children.length)) {
                            return retval;
                        } else {
                            return false;
                        }
                    }
                }
                retval.children = map_no_false(retval.children, remove_non_matching);
                return retval;
            }

            function show_selected(node) {
                function detect(child) {
                    return is_selected_or_has_selected_children(child);
                }
                if (_.detect(node.children, detect)) {
                    node.expand = true;
                }
                _.each(node.children, show_selected);
            }
            if (this.get("sparse")) {
                retval = map_no_false(retval, remove_unselected);
            }
            if (this.get("filter")) {
                retval = map_no_false(retval, remove_non_matching);
            }
            _.each(retval, show_selected);
            return retval;
        },
        getDataFor: function (key) {
            function getDataFromChildren(key, children) {
                var retval;
                _.detect(children, function (child) {
                    if (child.key === key) {
                        retval = child;
                        return true;
                    } else {
                        var child_result = getDataFromChildren(key, child.children);
                        if (child_result !== undefined) {
                            retval = child_result;
                            return true;
                        }
                    }
                    return false;
                });
                return retval;
            }
            return getDataFromChildren(key, this.get("children") || []);
        }
    }),
        Dynatree = Backbone.View.extend({
            initialize: function () {
                _.bindAll(this, "render");
                if (this.model.get("params").overlay) {
                    this.el.hide();
                }
                this.model.bind("change:children", this.render);
                this.model.bind("change:selected", this.render);
                this.model.bind("change:sparse", this.render);
                this.model.bind("change:filter", this.render);
            },
            render: function (model) {
                var tree = this.el.dynatree("getTree"),
                    params;

                function onQuerySelect(selected, node) {
                    if (!tree.isUserEvent()) {
                        return true;
                    }
                    var new_selected = model.get("selected"),
                        key = node.data.key;
                    if (selected) {
                        new_selected = _.union(new_selected, [key]);
                    } else {
                        new_selected = _.without(new_selected, key);
                    }
                    model.update_selected(new_selected);
                    return false;
                }

                if (tree.getRoot === undefined) {
                    params = _.extend({}, this.model.get("params"), {
                        children: this.model.getChildren(),
                        onQuerySelect: onQuerySelect
                    });
                    this.el.dynatree(params);
                    tree = this.el.dynatree("getTree");
                } else {
                    tree.options.children = this.model.getChildren();
                    tree.reload();
                }
                // We are faking here thet we are outside of the select event
                tree.phase = "idle";
                _.each(this.model.get("selected"), function (key) {
                    tree.getNodeByKey(key).select();
                });
            }
        }),
        HiddenForm = Backbone.View.extend({
            initialize: function () {
                _.bindAll(this, "render");
                this.model.bind("change:selected", this.render);
            },
            render: function () {
                var val = "";
                if (this.model.get("selected").length) {
                    val = _.reduce(this.model.get("selected"), function (a, b) {
                        return a + '|' + b;
                    });
                }
                this.el.val(val);
            }
        }),
        Filter = Backbone.View.extend({
            initialize: function () {
                _.bindAll(this, 'updateFilter', 'render');
                this.model.bind("change:filter", this.render);
            },
            events: {
                'keyup input': "updateFilter"
            },
            updateFilter: function () {
                var filter = this.el.find('.filter').val();
                this.model.set({
                    'filter': filter
                });
                if (filter && this.model.get("sparse")) {
                    this.model.set({
                        sparse: false
                    });
                }
                return false;
            },
            render: function () {
                this.el.find('input').val(this.model.get("filter"));
            }

        }),
        VariousUIElements = Backbone.View.extend({
            initialize: function () {
                _.bindAll(this, "toggleSparse", "render");
                this.model.bind("change:sparse", this.render);
                if (this.model.get('params').overlay) {
                    this.el.find(".treepopup").show().overlay();
                }
                this.render();
            },
            events: {
                "click .sparse": "toggleSparse"
            },
            toggleSparse: function () {
                if (!this.model.get("filter")) {
                    this.model.set({
                        sparse: !this.model.get("sparse")
                    });
                    this.render();
                }
            },
            render: function () {
                if (this.model.get("sparse")) {
                    this.el.find(".sparse").text("Expand");
                } else {
                    this.el.find(".sparse").text("Sparse");
                }
            }
        }),
        FlatListDisplay = Backbone.View.extend({
            initialize: function () {
                _.bindAll(this, "render", "delete_elem");
                this.template = _.template(this.el.find(".flatlist-template").html());
                this.model.bind("change:selected", this.render);
                this.model.bind("change:children", this.render);
            },
            events: {
                "click .delete": "delete_elem"
            },
            render: function () {
                var last_elem, ordered_keys = this.getOrderedKeys(),
                    model = this.model,
                    template = this.template,
                    el = this.el,
                    flatlist_items = this.el.find(".flatlist-item");
                _.each(flatlist_items.splice(1, flatlist_items.length), function (item) {
                    $(item).remove();
                });
                _.each(ordered_keys, function (key) {
                    var title = key,
                        new_elem;
                    if (model.get("params").FlatListShow !== "key") {
                        title = model.getDataFor(key).title;
                    }
                    new_elem = template({
                        title: title,
                        key: key
                    });
                    if (last_elem === undefined) {
                        el.append(new_elem);
                    } else {
                        last_elem.after(new_elem);
                        last_elem = new_elem;
                    }
                });
                el.append("<div class='visualClear'></div>");
            },
            getOrderedKeys: function () {
                var model = this.model,
                    sortFunc = function (key) {
                        return model.getDataFor(key).title;
                    };
                if (this.model.get("params").FlatListShow === "key") {
                    sortFunc = function (key) {
                        return key;
                    };
                }
                return _.sortBy(model.get("selected"), sortFunc);
            },
            delete_elem: function (event) {
                var key = $(event.target).parent(".flatlist-item").attr("key"),
                    new_selected = _.without(this.model.get("selected"), key);
                this.model.update_selected(new_selected);
            }
        });

    $(document).ready(function () {
        $('.dynatree-atwidget').each(function () {
            // get parameters 
            var tree, hiddeninput, filter, various, flatlist, jqthis = $(this),
                datamodel = new DataModel({
                    url: jqthis.find(".dynatree_ajax_vocabulary").text(),
                    selected: _.filter(jqthis.find('input.selected').val().split('|'), function (elem) {
                        return elem;
                    }),
                    params: jqthis.find('.dynatree_parameters').text(),
                    name: jqthis.find('input.selected').attr('id')
                });

            jqthis.data('collective.dynatree', datamodel);
            tree = new Dynatree({
                el: jqthis.find('.collective-dynatree-tree'),
                model: datamodel
            });
            hiddeninput = new HiddenForm({
                el: jqthis.find(".hiddeninput"),
                model: datamodel
            });
            if (datamodel.get("params").filter) {
                filter = new Filter({
                    el: jqthis.find(".dynatree_filter"),
                    model: datamodel
                });
            }
            if (datamodel.get("params").sparse) {
                various = new VariousUIElements({
                    el: jqthis.find(".ui_controls"),
                    model: datamodel
                });
            }
            if (datamodel.get("params").flatlist) {
                flatlist = new FlatListDisplay({
                    el: jqthis.find(".flatlist_container"),
                    model: datamodel
                });
            }
        });
    });
}(jQuery));