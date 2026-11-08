#!/usr/bin/env python3
"""
Builds the shareable Plan Auto-log shortcuts (iOS 27: a shortcut carries its own trigger) and signs them on a Mac.

    python3 scripts/shortcuts/build.py <out-dir>

Each shortcut asks one question when it's added ("Paste your Plan key"; Plan copies it first) and posts what the
trigger gives it to log_payment, in the same shape the guides set up by hand. Reads the server address and the
publishable key from .env (both are public: they ship in the app). Signing ("anyone") needs macOS and an Apple ID
signed in; the certificate is anonymous.
"""
import os
import plistlib
import subprocess
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def env(name: str) -> str:
    for line in (ROOT / '.env').read_text().splitlines():
        if line.startswith(name + '='):
            return line.split('=', 1)[1].strip().strip('"')
    raise SystemExit(f'{name} missing from .env')


URL = f"{env('EXPO_PUBLIC_SUPABASE_URL')}/rest/v1/rpc/log_payment?apikey={env('EXPO_PUBLIC_SUPABASE_ANON_KEY')}"
assert 'sb_secret_' not in URL, 'never ship a secret key'

OBJ = '￼'  # where a variable sits in a text field


def text(s: str) -> dict:
    return {'Value': {'string': s}, 'WFSerializationType': 'WFTextTokenString'}


def var(attachment: dict, before: str = '', after: str = '') -> dict:
    """A text field holding one variable, with optional text around it."""
    return {
        'Value': {'string': f'{before}{OBJ}{after}', 'attachmentsByRange': {f'{{{len(before)}, 1}}': attachment}},
        'WFSerializationType': 'WFTextTokenString',
    }


def vars_text(parts: list) -> dict:
    """A text field mixing plain text (str) and variables (dict), e.g. ['Wallet: ', subtitle, '\\n', body]."""
    string, ranges = '', {}
    for p in parts:
        if isinstance(p, str):
            string += p
        else:
            ranges[f'{{{len(string)}, 1}}'] = p
            string += OBJ
    return {'Value': {'string': string, 'attachmentsByRange': ranges}, 'WFSerializationType': 'WFTextTokenString'}


def trigger_output(trigger: str, prop: str) -> dict:
    return {'Type': 'TriggerOutput', 'TriggerIdentifier': trigger, 'Aggrandizements': [{'Type': 'WFPropertyVariableAggrandizement', 'PropertyName': prop}]}


def wallet_input(prop: str, user_info: str | None = None) -> dict:
    agg = {'Type': 'WFPropertyVariableAggrandizement', 'PropertyName': prop}
    if user_info:
        agg['PropertyUserInfo'] = user_info
    return {'Type': 'ExtensionInput', 'Aggrandizements': [agg]}


def key_action(key_uuid: str) -> dict:
    """A Text action holding the Plan key: the import question fills it in."""
    return {'WFWorkflowActionIdentifier': 'is.workflow.actions.gettext', 'WFWorkflowActionParameters': {'UUID': key_uuid, 'WFTextActionText': ''}}


def post_action(key_uuid: str, fields: list[tuple[str, dict]]) -> dict:
    token = var({'Type': 'ActionOutput', 'OutputUUID': key_uuid, 'OutputName': 'Text'})
    items = [{'WFItemType': 0, 'WFKey': text(k), 'WFValue': v} for k, v in [('token', token), *fields]]
    return {
        'WFWorkflowActionIdentifier': 'is.workflow.actions.downloadurl',
        'WFWorkflowActionParameters': {
            'UUID': str(uuid.uuid4()).upper(),
            'WFURL': URL,
            'WFHTTPMethod': 'POST',
            'WFHTTPBodyType': 'JSON',
            'ShowHeaders': True,
            'WFJSONValues': {'Value': {'WFDictionaryFieldValueItems': items}, 'WFSerializationType': 'WFDictionaryFieldValue'},
        },
    }


SCAN_URL = f"{env('EXPO_PUBLIC_SUPABASE_URL')}/functions/v1/scan-payment"


def scan_shortcut() -> dict:
    """Scan Payment: takes a screenshot and sends it (with the key) to the scan-payment function. No trigger: it runs
    from Back Tap or the Action Button."""
    key_uuid, shot_uuid = str(uuid.uuid4()).upper(), str(uuid.uuid4()).upper()
    token = var({'Type': 'ActionOutput', 'OutputUUID': key_uuid, 'OutputName': 'Text'})
    image = {'Value': {'Value': {'Type': 'ActionOutput', 'OutputUUID': shot_uuid, 'OutputName': 'Screenshot'}, 'WFSerializationType': 'WFTextTokenAttachment'}, 'WFSerializationType': 'WFTokenAttachmentParameterState'}
    wf = shortcut(None, [], color=3980825855, glyph=62322)
    wf['WFWorkflowTypes'] = ['Watch', 'WFWorkflowTypeShowInSearch']
    wf['WFWorkflowActions'] = [
        key_action(key_uuid),
        {'WFWorkflowActionIdentifier': 'is.workflow.actions.takescreenshot', 'WFWorkflowActionParameters': {'UUID': shot_uuid}},
        {
            'WFWorkflowActionIdentifier': 'is.workflow.actions.downloadurl',
            'WFWorkflowActionParameters': {
                'UUID': str(uuid.uuid4()).upper(),
                'WFURL': SCAN_URL,
                'WFHTTPMethod': 'POST',
                'WFHTTPBodyType': 'Form',
                'WFFormValues': {
                    'Value': {'WFDictionaryFieldValueItems': [{'WFItemType': 0, 'WFKey': text('token'), 'WFValue': token}, {'WFItemType': 5, 'WFKey': text('image'), 'WFValue': image}]},
                    'WFSerializationType': 'WFDictionaryFieldValue',
                },
            },
        },
    ]
    return wf


def app_alerts_shortcut() -> dict:
    """Any app's payment notifications: asks for the key and the app's name (sent as merchant, so Plan files it under
    that source). The trigger's app is picked by the user after adding it."""
    wf = shortcut(None, [], color=4292093695, glyph=59448)
    key_uuid, app_uuid = str(uuid.uuid4()).upper(), str(uuid.uuid4()).upper()
    name = var({'Type': 'ActionOutput', 'OutputUUID': app_uuid, 'OutputName': 'Text'})
    body = var(trigger_output(NOTIFY, 'Body'))
    wf['WFWorkflowActions'] = [
        key_action(key_uuid),
        {'WFWorkflowActionIdentifier': 'is.workflow.actions.gettext', 'WFWorkflowActionParameters': {'UUID': app_uuid, 'WFTextActionText': ''}},
        post_action(key_uuid, [('amount', body), ('merchant', name)]),
    ]
    wf['WFWorkflowImportQuestions'].append(
        {'ActionIndex': 1, 'Category': 'Parameter', 'ParameterKey': 'WFTextActionText', 'DefaultValue': '', 'Text': 'Which app is this for? Type its name as it is in Plan (e.g. YouTrip).'}
    )
    return wf


def bank_emails_shortcut() -> dict:
    """Any bank's alert emails: asks for the key and the source's name (sent as merchant). The user sets the sender in
    the trigger after adding it."""
    wf = shortcut(None, [], color=4282601983, glyph=59819)
    key_uuid, name_uuid = str(uuid.uuid4()).upper(), str(uuid.uuid4()).upper()
    wf['WFWorkflowActions'] = [
        key_action(key_uuid),
        {'WFWorkflowActionIdentifier': 'is.workflow.actions.gettext', 'WFWorkflowActionParameters': {'UUID': name_uuid, 'WFTextActionText': ''}},
        post_action(key_uuid, [('amount', var(trigger_output(EMAIL, 'Content'))), ('merchant', var({'Type': 'ActionOutput', 'OutputUUID': name_uuid, 'OutputName': 'Text'}))]),
    ]
    wf['WFWorkflowImportQuestions'].append(
        {'ActionIndex': 1, 'Category': 'Parameter', 'ParameterKey': 'WFTextActionText', 'DefaultValue': '', 'Text': 'What is this source called in Plan? (e.g. OCBC emails)'}
    )
    return wf


def notification_trigger(bundle: str, name: str, team: str, contains: str) -> dict:
    return {
        'WFTriggerIdentifier': 'WFNotificationTrigger',
        'WFTriggerUUID': str(uuid.uuid4()).upper(),
        'WFTriggerSerializedParameters': {
            'SelectedApps': {'BundleIdentifier': bundle, 'Name': name, 'TeamIdentifier': team},
            'Conditions': {
                'Value': {
                    'WFActionParameterFilterPrefix': 1,
                    'WFActionParameterFilterTemplates': [{'Removable': True, 'Operator': 0, 'Property': 'Body', 'Values': {'Body': contains}}],
                    'WFContentPredicateBoundedDate': False,
                },
                'WFSerializationType': 'WFContentPredicateTableTemplate',
            },
        },
    }


def email_trigger(sender: str, subject: str) -> dict:
    return {
        'WFTriggerIdentifier': 'WFEmailTrigger',
        'WFTriggerUUID': str(uuid.uuid4()).upper(),
        'WFTriggerSerializedParameters': {
            'WFEmailConditions': {
                'Value': {
                    'WFActionParameterFilterPrefix': 1,
                    'WFContentPredicateBoundedDate': False,
                    'WFActionParameterFilterTemplates': [
                        {
                            'Operator': 0,
                            'Property': 'Sender',
                            'Removable': False,
                            'Values': {'Email': {'Value': {'WFContactFieldValues': [{'EntryType': 2, 'SerializedEntry': {'link.contentkit.emailaddress': sender}}]}, 'WFSerializationType': 'WFContactFieldValue'}},
                        },
                        {'Operator': 1, 'Property': 'Subject', 'Removable': True, 'Values': {'Text': subject}},
                    ],
                },
                'WFSerializationType': 'WFContentPredicateTableTemplate',
            }
        },
    }


INPUT_CLASSES = ['WFAppContentItem', 'WFArticleContentItem', 'WFContactContentItem', 'WFDateContentItem', 'WFEmailAddressContentItem', 'WFGenericFileContentItem', 'WFImageContentItem', 'WFLocationContentItem', 'WFPhoneNumberContentItem', 'WFRichTextContentItem', 'WFStringContentItem', 'WFURLContentItem']


def shortcut(trigger: dict | None, fields: list[tuple[str, dict]], color: int, glyph: int) -> dict:
    key_uuid = str(uuid.uuid4()).upper()
    return {
        'WFWorkflowClientVersion': '5114.0.8.3',
        'WFWorkflowMinimumClientVersion': 900,
        'WFWorkflowMinimumClientVersionString': '900',
        'WFWorkflowIcon': {'WFWorkflowIconStartColor': color, 'WFWorkflowIconGlyphNumber': glyph},
        'WFWorkflowTypes': ['WFWorkflowTypeShowInSearch'],
        'WFWorkflowInputContentItemClasses': INPUT_CLASSES,
        'WFWorkflowOutputContentItemClasses': [],
        'WFWorkflowHasOutputFallback': False,
        'WFWorkflowHasShortcutInputVariables': True,
        'WFQuickActionSurfaces': [],
        'WFWorkflowTriggers': [trigger] if trigger else [],
        'WFWorkflowImportQuestions': [
            {'ActionIndex': 0, 'Category': 'Parameter', 'ParameterKey': 'WFTextActionText', 'DefaultValue': '', 'Text': 'Paste your Plan key. Plan copied it for you: tap here, then Paste.'}
        ],
        'WFWorkflowActions': [key_action(key_uuid), post_action(key_uuid, fields)],
    }


NOTIFY, EMAIL = 'WFNotificationTrigger', 'WFEmailTrigger'
SHORTCUTS = {
    # Tap to pay: the transaction itself (merchant is sometimes missing; Plan fills it from a bank alert).
    'Plan Apple Pay': shortcut(
        {'WFTriggerIdentifier': 'WFWalletTransactionTrigger', 'WFTriggerSerializedParameters': {}, 'WFTriggerUUID': str(uuid.uuid4()).upper()},
        [('amount', var(wallet_input('Amount'))), ('merchant', var(wallet_input('Merchant'))), ('card', var(wallet_input('Name', 'WFItemName')))],
        color=-2873601,
        glyph=59740,
    ),
    # Wallet's payment notification on iPhone: title = the card's bank, subtitle = the shop, message = the amount.
    # Sent like MacroDroid does (merchant = title, card = "<app>: <text>"), so Plan reads it as a wallet notification.
    'Plan Wallet alerts': shortcut(
        notification_trigger('com.apple.Passbook', 'Wallet', '0000000000', '.'),
        # Title: the card's bank. Subtitle: the shop. Body: the amount. Plan reads "Wallet: <shop>\n<amount>".
        [
            ('amount', var(trigger_output(NOTIFY, 'Body'))),
            ('merchant', var(trigger_output(NOTIFY, 'Title'))),
            ('card', vars_text(['Wallet: ', trigger_output(NOTIFY, 'Subtitle'), '\n', trigger_output(NOTIFY, 'Body')])),
        ],
        color=-23508481,
        glyph=61974,
    ),
    # Grab: only "has been charged" alerts (GrabPay charges); the notification's text, with the app as merchant.
    'Plan Grab': shortcut(
        notification_trigger('com.grabtaxi.iphone', 'Grab', 'C9YMA892DM', 'has been charged'),
        [('amount', var(trigger_output(NOTIFY, 'Body'))), ('merchant', text('Grab'))],
        color=4292093695,
        glyph=59448,
    ),
    # SimplyGo fare alerts ("Fare $1.28 - Bus 12 …"). The trigger (Notification › SimplyGo › Message contains Fare) is
    # added on the iPhone before sharing, since a signed file's trigger doesn't survive importing.
    'Plan SimplyGo': shortcut(
        None,
        [('amount', var(trigger_output(NOTIFY, 'Body'))), ('merchant', text('SimplyGo'))],
        color=4282601983,
        glyph=59448,
    ),
    'Plan Scan Payment': scan_shortcut(),
    'Plan App alerts': app_alerts_shortcut(),
    'Plan Bank emails': bank_emails_shortcut(),
    # DBS PayLah! Transaction Alerts emails: the whole email; Plan reads the amount and who was paid.
    'Plan PayLah emails': shortcut(
        email_trigger('paylah.alert@dbs.com', 'Transaction Alerts'),
        [('amount', var(trigger_output(EMAIL, 'Content'))), ('merchant', text('DBS PayLah! emails'))],
        color=4282601983,
        glyph=59819,
    ),
}


def main() -> None:
    out = Path(sys.argv[1] if len(sys.argv) > 1 else 'shortcuts-out')
    out.mkdir(parents=True, exist_ok=True)
    for name, wf in SHORTCUTS.items():
        raw = out / f'{name}.unsigned.shortcut'
        signed = out / f'{name}.shortcut'
        with open(raw, 'wb') as f:
            plistlib.dump(wf, f, fmt=plistlib.FMT_BINARY)
        subprocess.run(['shortcuts', 'sign', '--mode', 'anyone', '--input', str(raw), '--output', str(signed)], check=True, capture_output=True)
        os.remove(raw)
        print('signed', signed)


if __name__ == '__main__':
    main()
