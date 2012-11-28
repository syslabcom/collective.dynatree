#!/usr/bin/python
# -*- coding: utf-8 -*-

from Acquisition import aq_inner
from plone.autoform.interfaces import IFormFieldProvider
from Products.Five.browser import BrowserView
from z3c.json.converter import JSONWriter
from zope.schema.interfaces import IVocabularyFactory
import zope.component
import zope.interface

from collective.dynatree.features import HAS_DEXTERITY
from collective.dynatree.utils import dict2dynatree

if HAS_DEXTERITY:
    from plone.behavior.interfaces import IBehaviorAssignable
    from plone.dexterity.interfaces import IDexterityFTI


class FieldVocabDynatreeJsonView(BrowserView):

    def __call__(self):
        context = aq_inner(self.context)
        fieldname = self.request.get('fieldname')
        if HAS_DEXTERITY:
            portal_type = self.request.get('portal_type')
            fti = zope.component.getUtility(IDexterityFTI,
                    name=portal_type)
            schema = fti.lookupSchema()
        else:
            schema = context.Schema()

        field = schema.get(fieldname)

        if field is None and HAS_DEXTERITY:

            # The field might be defined in a behavior schema

            behavior_assignable = IBehaviorAssignable(context)
            for behavior_reg in \
                behavior_assignable.enumerateBehaviors():
                behavior_schema = \
                    IFormFieldProvider(behavior_reg.interface, None)
                if behavior_schema is not None:
                    field = behavior_schema.get(fieldname)
                    if field is not None:
                        break

        vname = field.vocabularyName
        factory = zope.component.getUtility(IVocabularyFactory, vname)
        tree = factory(context)

        # XXX: "selected" is not set in input.pt, so does it make sense
        # to check for it here? Only if this json view is called
        # elsewhere, which doesn't seem to be the case...

        selected = self.request.get('selected', '').split('|')
        leafsOnly = self.request.get('leafsOnly', True)
        showKey = self.request.get('showKey', False)
        return JSONWriter().write(dict2dynatree(tree, selected, leafsOnly, showKey))
