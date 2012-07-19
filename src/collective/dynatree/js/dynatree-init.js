/*jslint nomen: true */
/*global jQuery, _, Backbone, document */
/*
This is a lot of code.
To understand it, one should understand Backbone and/or MVC a bit.
A short summary:
We create a DataModel Object. It knows what the tree contains, what options
there are and what everybody may display.
Then there are a number of View objects.
Each view object represents a part of the information from the model to the
user. FlatList represents the selected options, Dynatree options all.
Here is an example of how things work together:
In the initialization, we extract options from the form and create a
DataModel Instance.
Then we initialize an instance of each View, for some views we do this
conditionally, because they are optional.
Upon initalization, each view receives the DataModel as a `model`
Each view registers itself on some events on the model.
For this to work, it is important, not to change attributes in the model
directly, but with setters.
This is why the Dynatree widget defines a custom onQuerySelect handler,
which gets called when somebody wants to select an option, before the
js.dynatree updates its state.

Imagine we'd have a dynatree set up, the sparse button is activated.

Now when somebody clicks on "sparse", the event is handled in 
VariousUIElements.toggleSparse.
This method updates the sparse attribute on the model via set()
Backbone automatically emits some events, the dynatree view registered itself
to this event. It registered its render method.
This gets called, and does a number of things. At the end, it sees that there
is already a dynatree, so it sets the children upon the dynatree and calls
the update method of the tree. The children it got from the model, and because
now a sparse flag is set, the model only returns selected nodes. The tree
from now on does not know any longer that there are more nodes.
*/
(function ($) {
    "use strict"; /*jslint regexp: true */
    _.templateSettings = {
        interpolate: /\{\{(.+?)\}\}/g
    }; /*jslint regexp: false */

    var DataModel = Backbone.Model.extend({
        /* 
        The DataModel represents the complete tree data independent of its
        representation and all options and states of the different views
        */
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
            /*
            set the selected elements of the tree to `selected`
            */
            if (this.get("params").selectMode === 1) { // Single Select
                if (selected.length) {
                    selected = [_.last(selected)];
                } else {
                    selected = [];
                }
            }
            this.set({
                selected: selected
            });
        },
        update: function (result) {
            /*
            Update the tree based on the JSON data contained in `result`
            */
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
        reset: function () {
            var children = this.get("children");
            this.set({
                sparse: false,
                filter: ''
            });

            function unexpand(node) {
                _.each(node.children, unexpand);
                node.expand = false;
            }
            _.each(children, unexpand);
            this.set({
                sparse: false,
                filter: '',
                children: children
            });



        },
        getChildren: function () {
            /*
            Get the children information as required by the dynatree
            Prefiltered according to settings like filter and sparse options
            */
            var selected = this.get("selected"),
                filter = this.get("filter") && this.get("filter").toLowerCase(),
                sparse_cache = {},
                count_cache = {},
                retval = this.get("children"),
                few_limit;

            function map_no_false(elems, filter) {
                return _.without(_.map(elems, filter), false);
            }

            function count_children(node) {
                if (count_cache[node.key] !== undefined) {
                    return count_cache[node.key];
                }
                var count = node.children.length;
                _.each(node.children, function (node) {
                    count += count_children(node);
                });
                count_cache[node.key] = count;
                return count;
            }

            function is_selected_or_has_selected_children_or_few(node, few_limit) {
                if (few_limit === undefined) {
                    few_limit = -1;
                }
                if (sparse_cache[node.key] !== undefined) {
                    return sparse_cache[node.key];
                }

                function detect1(selected_key) {
                    return selected_key === node.key || (count_children(node) <= few_limit);
                }

                function detect2(child) {
                    return is_selected_or_has_selected_children_or_few(child, few_limit);
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
                if (!is_selected_or_has_selected_children_or_few(node)) {
                    return false;
                }
                var retval = _.clone(node);
                retval.children = map_no_false(retval.children, remove_unselected);
                return retval;
            }

            function remove_non_matching(node) {
                var retval = _.clone(node),
                    match = node.title.toLowerCase().indexOf(filter) !== -1;
                if (match) {
                    retval.addClass = 'filtermatch';

                } else {
                    retval.addClass = '';

                }
                if (!is_selected_or_has_selected_children_or_few(node)) {
                    if (match) {
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

            function show_selected_or_few(node, few_limit) {
                if (few_limit === undefined) {
                    few_limit = -1;
                }

                function detect(child) {
                    return is_selected_or_has_selected_children_or_few(child, few_limit);
                }
                if (count_children(node) <= few_limit && count_children(node)) {
                    node.expand = true;
                }
                if (_.detect(node.children, detect)) {
                    node.expand = true;
                }
                _.each(node.children, function (node) {
                    show_selected_or_few(node, few_limit);
                });
            }
            if (this.get("sparse")) {
                retval = map_no_false(retval, remove_unselected);
            }
            if (this.get("filter")) {
                retval = map_no_false(retval, remove_non_matching);
                count_cache = {};
                few_limit = 3;
            }
            _.each(retval, function (node) {
                show_selected_or_few(node, few_limit);
            });
            return retval;
        },
        getDataFor: function (key) {
            /*
            Get information for a specific child node, identified by `key`
            */
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
            /*
            Represents the tree as a dynatree
            */
            initialize: function () {
                _.bindAll(this, "render");
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
            /*
            Represents the Tree as a hidden form, ready to be parsed
            in plone
            */
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
            /*
            Represents the filter.
            */
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
        OverlayElement = Backbone.View.extend({
            initialize: function () {
                var model = this.model;
                this.el.overlay({
                    mask: {
                        color: '#ebecff',
                        loadSpeed: 200,
                        opacity: 0.9
                    },
                    onBeforeLoad: function () {
                        model.reset();
                    }
                });
            }

        }),

        VariousUIElements = Backbone.View.extend({
            /*
            Represents some buttons with limited functionality
            */
            initialize: function () {
                _.bindAll(this, "toggleSparse", "render");
                this.model.bind("change:sparse", this.render);
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
            /*
            Represents the tree as a flat list, safes space
            */
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
            var tree, hiddeninput, filter, various, flatlist, overlay, jqthis = $(this),
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
            if (datamodel.get("params").overlay) {
                overlay = new OverlayElement({
                    el: jqthis.find(".treepopup"),
                    model: datamodel
                });
            }
        });
    });
}(jQuery));