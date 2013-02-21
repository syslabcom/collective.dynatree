import pkg_resources
try:
    pkg_resources.get_distribution('plone.dexterity')
except pkg_resources.DistributionNotFound:
    HAS_DEXTERITY = False
except pkg_resources.VersionConflict:
    # No version requirement given
    pass 
else:
    HAS_DEXTERITY = True
