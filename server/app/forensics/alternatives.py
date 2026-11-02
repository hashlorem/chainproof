"""
The innocent explanation for each kind of finding: "what else would produce this?". Shown under every finding so the
examiner tests it before relying on the finding. Kept in one place, keyed by finding title, so the wording can be
reviewed as a whole. A finding without an entry needs none (signed captures, informational notes).
"""

ALTERNATIVES = {
    "Cloned area detected": "Identical real objects (two copies of a product, printed text, tiles) look like a clone. "
                            "Look at both regions at 100% before relying on it.",
    "Possible cloned area": "Identical real objects (two copies of a product, printed text, tiles) look like a clone. "
                            "Look at both regions at 100% before relying on it.",
    "Edited with image software": "A harmless crop, rotation or resize in the same program leaves the same tag. It shows "
                                  "the file was handled, not what was changed.",
    "Modified after it was taken": "Phones and photo apps rewrite this date when they rotate, export or back up a photo.",
    "No EXIF metadata": "Messaging apps, social networks and screenshots remove it as a matter of course.",
    "No camera make/model": "Many apps keep some metadata but drop the camera fields when they re-save.",
    "AI generator named in metadata": "Anyone can type a generator's name into a real photo's metadata, for example to "
                                      "discredit it.",
    "Content Credentials say AI-generated": "The credentials can describe an AI edit of a real photo, not a fully generated "
                                            "image. Read which actions they list.",
    "Content Credentials claim AI, signer not trusted": "Anyone can sign such a claim with a certificate they made "
                                                        "themselves.",
    "Content Credentials do not validate": "Converting or re-saving a file after it was signed breaks the signature "
                                           "without changing what it shows.",
    "Uneven compression (visual aid)": "Photos that were shared, resized or re-saved often show uneven compression "
                                       "without any edit.",
    "Changed compared with the original": "Heavy compression, a filter or a crop on the copy can leave changed areas. "
                                          "Look at what changed, not only that something did.",
}


def annotate(report: dict) -> dict:
    """Adds 'alternative' to each finding that has one. Safe to run on reports stored before this existed."""
    for f in report.get("findings", []):
        f["alternative"] = ALTERNATIVES.get(f.get("title"))
    return report
