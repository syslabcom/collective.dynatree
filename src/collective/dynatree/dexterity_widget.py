#!/usr/bin/python
# -*- coding: utf-8 -*-
import zope.component
import zope.interface

from z3c.form.widget import SequenceWidget
import z3c.form

import interfaces


class DynatreeWidget(z3c.form.browser.widget.HTMLInputWidget,
    SequenceWidget):

    ''' A text field widget with a dynatree javascript vocabulary to determine
        the value.
    '''

    zope.interface.implementsOnly(interfaces.IDynatreeWidget)
    klass = u'dynatree-widget'
    selectMode = 1
    minExpandLevel = 0
    rootVisible = False
    autoCollapse = False
    leafsOnly = True
    showKey = False
    atvocabulary = None

    @property
    def widget_value(self):
        return self.request.get(self.__name__, '|'.join(v for v in
                                self.value))

    @property
    def field_name(self):
        return self.__name__

    @property
    def portal_type(self):
        return self.form.portal_type

    def dynatree_parameters(self):
        result = ['%s,%s' % (parameter, getattr(self, parameter))
                  for parameter in ['selectMode', 'minExpandLevel',
                  'rootVisible', 'autoCollapse']]
        result.append('title,%s' % self.label)
        return '/'.join(result)


@zope.component.adapter(zope.schema.TextLine,
                        z3c.form.interfaces.IFormLayer)
@zope.interface.implementer(z3c.form.interfaces.IFieldWidget)
def DynatreeFieldWidget(field, request):
    ''' IFieldWidget factory for DynatreeWidget
    '''

    return z3c.form.widget.FieldWidget(field, DynatreeWidget(request))
