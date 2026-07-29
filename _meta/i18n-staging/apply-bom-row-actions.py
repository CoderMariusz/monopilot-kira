#!/usr/bin/env python3
"""FALA-04 / FIX-BOM [B-5][B-7][B-14] — land the BOM row-action namespace and the
untranslated BOM action-bar copy in ALL FOUR runtime bundles.

Rewrites apps/web/i18n/{en,pl,ro,uk}.json with json.dumps(indent=2, ensure_ascii=False)
+ trailing newline, which round-trips those files byte-for-byte (verified before use).
Only the keys listed here are touched; nothing is reordered or removed.
"""
import json
import os

I18N = os.path.join(os.path.dirname(__file__), '..', '..', 'apps', 'web', 'i18n')

# ── [B-7][B-14] technical.bom.rowActions — the 30 keys bom-line-row-actions.tsx
# actually resolves via tg(). `manufacturingOperationRequired` is deliberately NOT
# here: [B-11] removed that error, so shipping the key would add a new dead one.
ROW_ACTIONS = {
    'en': {
        'rowActionsLabel': 'Row actions',
        'moveUp': 'Move up',
        'moveDown': 'Move down',
        'moveUpFor': 'Move {component} up',
        'moveDownFor': 'Move {component} down',
        'moveError': 'Unable to reorder this component line. Please try again.',
        'edit': 'Edit',
        'editTitle': 'Edit component line',
        'editSubtitle': 'Update the quantity, unit of measure, scrap % or manufacturing operation for {component}.',
        'quantity': 'Quantity',
        'quantityInvalid': 'Enter a quantity greater than zero.',
        'uom': 'Unit of measure',
        'scrapPct': 'Scrap %',
        'scrapInvalid': 'Enter a scrap % between 0 and 100.',
        'scrapPrecision': 'Scrap % supports at most 2 decimal places.',
        'scrapHigh': 'Scrap of {value}% is unusually high (V-TEC-11).',
        'manufacturingOperation': 'Manufacturing operation',
        'manufacturingOperationPlaceholder': 'Select operation',
        'save': 'Save changes',
        'saving': 'Saving…',
        'cancel': 'Cancel',
        'saveError': 'Unable to update this component line. Please try again.',
        'delete': 'Delete',
        'deleteTitle': 'Remove component line',
        'deleteConfirm': 'Remove {component} from this BOM version? This cannot be undone.',
        'deleteAction': 'Remove component',
        'deleting': 'Removing…',
        'deleteError': 'Unable to remove this component line. Please try again.',
        'notEditable': 'This BOM version is approved or active — its components can no longer be edited.',
        'forbidden': 'You do not have permission to edit BOM components.',
    },
    'pl': {
        'rowActionsLabel': 'Akcje wiersza',
        'moveUp': 'Przenieś w górę',
        'moveDown': 'Przenieś w dół',
        'moveUpFor': 'Przenieś {component} w górę',
        'moveDownFor': 'Przenieś {component} w dół',
        'moveError': 'Nie udało się zmienić kolejności tej pozycji składnika. Spróbuj ponownie.',
        'edit': 'Edytuj',
        'editTitle': 'Edytuj pozycję składnika',
        'editSubtitle': 'Zaktualizuj ilość, jednostkę miary, straty % lub operację produkcyjną dla {component}.',
        'quantity': 'Ilość',
        'quantityInvalid': 'Podaj ilość większą od zera.',
        'uom': 'Jednostka miary',
        'scrapPct': 'Straty %',
        'scrapInvalid': 'Podaj straty % z zakresu od 0 do 100.',
        'scrapPrecision': 'Straty % obsługują maksymalnie 2 miejsca po przecinku.',
        'scrapHigh': 'Straty {value}% są nietypowo wysokie (V-TEC-11).',
        'manufacturingOperation': 'Operacja produkcyjna',
        'manufacturingOperationPlaceholder': 'Wybierz operację',
        'save': 'Zapisz zmiany',
        'saving': 'Zapisywanie…',
        'cancel': 'Anuluj',
        'saveError': 'Nie udało się zaktualizować tej pozycji składnika. Spróbuj ponownie.',
        'delete': 'Usuń',
        'deleteTitle': 'Usuń pozycję składnika',
        'deleteConfirm': 'Usunąć {component} z tej wersji BOM? Tej operacji nie można cofnąć.',
        'deleteAction': 'Usuń składnik',
        'deleting': 'Usuwanie…',
        'deleteError': 'Nie udało się usunąć tej pozycji składnika. Spróbuj ponownie.',
        'notEditable': 'Ta wersja BOM jest zatwierdzona lub aktywna — jej składników nie można już edytować.',
        'forbidden': 'Nie masz uprawnień do edycji składników BOM.',
    },
    'ro': {
        'rowActionsLabel': 'Acțiuni pentru rând',
        'moveUp': 'Mută în sus',
        'moveDown': 'Mută în jos',
        'moveUpFor': 'Mută {component} în sus',
        'moveDownFor': 'Mută {component} în jos',
        'moveError': 'Nu s-a putut reordona această linie de componentă. Încercați din nou.',
        'edit': 'Editează',
        'editTitle': 'Editează linia de componentă',
        'editSubtitle': 'Actualizați cantitatea, unitatea de măsură, procentul de pierderi sau operația de producție pentru {component}.',
        'quantity': 'Cantitate',
        'quantityInvalid': 'Introduceți o cantitate mai mare decât zero.',
        'uom': 'Unitate de măsură',
        'scrapPct': 'Pierderi %',
        'scrapInvalid': 'Introduceți un procent de pierderi între 0 și 100.',
        'scrapPrecision': 'Procentul de pierderi acceptă cel mult 2 zecimale.',
        'scrapHigh': 'Pierderile de {value}% sunt neobișnuit de mari (V-TEC-11).',
        'manufacturingOperation': 'Operație de producție',
        'manufacturingOperationPlaceholder': 'Selectați operația',
        'save': 'Salvează modificările',
        'saving': 'Se salvează…',
        'cancel': 'Anulează',
        'saveError': 'Nu s-a putut actualiza această linie de componentă. Încercați din nou.',
        'delete': 'Șterge',
        'deleteTitle': 'Elimină linia de componentă',
        'deleteConfirm': 'Eliminați {component} din această versiune BOM? Acțiunea nu poate fi anulată.',
        'deleteAction': 'Elimină componenta',
        'deleting': 'Se elimină…',
        'deleteError': 'Nu s-a putut elimina această linie de componentă. Încercați din nou.',
        'notEditable': 'Această versiune BOM este aprobată sau activă — componentele ei nu mai pot fi editate.',
        'forbidden': 'Nu aveți permisiunea de a edita componentele BOM.',
    },
    'uk': {
        'rowActionsLabel': 'Дії рядка',
        'moveUp': 'Перемістити вгору',
        'moveDown': 'Перемістити вниз',
        'moveUpFor': 'Перемістити {component} вгору',
        'moveDownFor': 'Перемістити {component} вниз',
        'moveError': 'Не вдалося змінити порядок цього рядка компонента. Спробуйте ще раз.',
        'edit': 'Редагувати',
        'editTitle': 'Редагування рядка компонента',
        'editSubtitle': 'Оновіть кількість, одиницю виміру, відсоток втрат або виробничу операцію для {component}.',
        'quantity': 'Кількість',
        'quantityInvalid': 'Введіть кількість більшу за нуль.',
        'uom': 'Одиниця виміру',
        'scrapPct': 'Втрати %',
        'scrapInvalid': 'Введіть відсоток втрат від 0 до 100.',
        'scrapPrecision': 'Відсоток втрат підтримує щонайбільше 2 десяткові знаки.',
        'scrapHigh': 'Втрати {value}% є незвично високими (V-TEC-11).',
        'manufacturingOperation': 'Виробнича операція',
        'manufacturingOperationPlaceholder': 'Виберіть операцію',
        'save': 'Зберегти зміни',
        'saving': 'Збереження…',
        'cancel': 'Скасувати',
        'saveError': 'Не вдалося оновити цей рядок компонента. Спробуйте ще раз.',
        'delete': 'Видалити',
        'deleteTitle': 'Видалення рядка компонента',
        'deleteConfirm': 'Видалити {component} з цієї версії BOM? Цю дію не можна скасувати.',
        'deleteAction': 'Видалити компонент',
        'deleting': 'Видалення…',
        'deleteError': 'Не вдалося видалити цей рядок компонента. Спробуйте ще раз.',
        'notEditable': 'Ця версія BOM затверджена або активна — її компоненти більше не можна редагувати.',
        'forbidden': 'У вас немає дозволу редагувати компоненти BOM.',
    },
}

# ── [B-5] ro/uk translations for BOM copy that was a verbatim English copy.
# Covers the whole action bar + delete modal (every one of those keys renders on the
# BOM detail screen this wave touched), plus the remaining technical.bom *Blocked* keys.
TRANSLATIONS = {
    'ro': {
        'technical.bom.actions': {
            'addComponent': 'Adaugă componentă',
            'saveVersion': 'Salvează versiunea',
            'approve': 'Aprobă',
            'approving': 'Se aprobă…',
            'approveError': 'Nu s-a putut aproba această versiune BOM. Încercați din nou.',
            'approveForbidden': 'Nu aveți permisiunea de a aproba BOM-uri.',
            'publish': 'Publică',
            'publishing': 'Se publică…',
            'publishError': 'Nu s-a putut publica această versiune BOM. Încercați din nou.',
            'publishForbidden': 'Nu aveți permisiunea de a publica BOM-uri.',
            'deleteVersion': 'Șterge versiunea',
            'addComponentBlockedArchived': 'Nu se pot adăuga componente — această versiune BOM este arhivată.',
            'addComponentBlockedSuperseded': 'Nu se pot adăuga componente — această versiune BOM a fost înlocuită de una mai nouă.',
            'addComponentBlockedStatus': 'Nu se pot adăuga componente la această versiune BOM.',
            'saveVersionBlockedArchived': 'Nu se poate salva — această versiune BOM este arhivată.',
            'saveVersionBlockedSuperseded': 'Nu se poate salva — această versiune BOM a fost înlocuită de una mai nouă.',
            'saveVersionBlockedStatus': 'Această versiune BOM nu poate fi salvată.',
            'saveVersionBlockedEmpty': 'Adăugați cel puțin o componentă înainte de a salva o versiune.',
            'deleteForbidden': 'Nu aveți permisiunea de a șterge versiuni BOM.',
            'deleteSnapshotBlocked': 'Nu se poate șterge: instantanee ale comenzilor de producție fac referire la această versiune. Ștergeți mai întâi instantaneele.',
            'deleteOnlyVersion': 'Nu se poate șterge singura versiune a unui BOM.',
            'deleteStatusBlocked': 'Se pot șterge doar versiunile ciornă — versiunile aprobate sau active nu sunt niciodată eliminate.',
            'deleteError': 'Nu s-a putut șterge această versiune BOM. Încercați din nou.',
        },
        'technical.bomDelete': {
            'title': 'Ștergerea versiunii BOM',
            'subtitle': 'Ireversibil — afectează instantaneele istorice ale comenzilor de producție care fac referire la această versiune.',
            'warning': 'Versiunea {version} va fi eliminată definitiv. Instantaneele comenzilor de producție din planificare care fac referire la această versiune vor apărea ca „orfane”.',
            'blockedBySnapshots': 'Blocat: {count} instantaneu(e) de comandă de producție fac referire la {version}. Ștergeți mai întâi instantaneele.',
            'blockedByStatus': 'Se pot șterge doar versiunile ciornă. Versiunile active sau aprobate nu sunt niciodată eliminate.',
            'confirmLabel': 'Tastați {version} pentru a confirma',
            'cancel': 'Anulează',
            'delete': 'Șterge versiunea',
        },
        'technical.bom.edit': {
            'usabilityBlocked': 'Componentă blocată ({code}): {message}',
        },
        'technical.bom.newBom': {
            'blockedHint': 'Doar produsele finite active pot avea un BOM creat pentru ele.',
        },
        'technical.bom.newBom.status': {
            'blocked': 'Blocat',
        },
        'Technical.releaseBundle': {
            'approveBlocked': 'Aprobă (blocat)',
        },
    },
    'uk': {
        'technical.bom.actions': {
            'addComponent': 'Додати компонент',
            'saveVersion': 'Зберегти версію',
            'approve': 'Затвердити',
            'approving': 'Затвердження…',
            'approveError': 'Не вдалося затвердити цю версію BOM. Спробуйте ще раз.',
            'approveForbidden': 'У вас немає дозволу затверджувати BOM.',
            'publish': 'Опублікувати',
            'publishing': 'Публікація…',
            'publishError': 'Не вдалося опублікувати цю версію BOM. Спробуйте ще раз.',
            'publishForbidden': 'У вас немає дозволу публікувати BOM.',
            'deleteVersion': 'Видалити версію',
            'addComponentBlockedArchived': 'Не можна додавати компоненти — цю версію BOM заархівовано.',
            'addComponentBlockedSuperseded': 'Не можна додавати компоненти — цю версію BOM замінено новішою.',
            'addComponentBlockedStatus': 'Не можна додавати компоненти до цієї версії BOM.',
            'saveVersionBlockedArchived': 'Не можна зберегти — цю версію BOM заархівовано.',
            'saveVersionBlockedSuperseded': 'Не можна зберегти — цю версію BOM замінено новішою.',
            'saveVersionBlockedStatus': 'Цю версію BOM не можна зберегти.',
            'saveVersionBlockedEmpty': 'Додайте щонайменше один компонент, перш ніж зберігати версію.',
            'deleteForbidden': 'У вас немає дозволу видаляти версії BOM.',
            'deleteSnapshotBlocked': 'Не можна видалити: знімки виробничих замовлень посилаються на цю версію. Спочатку видаліть знімки.',
            'deleteOnlyVersion': 'Не можна видалити єдину версію BOM.',
            'deleteStatusBlocked': 'Видаляти можна лише чернеткові версії — затверджені або активні версії ніколи не видаляються.',
            'deleteError': 'Не вдалося видалити цю версію BOM. Спробуйте ще раз.',
        },
        'technical.bomDelete': {
            'title': 'Видалення версії BOM',
            'subtitle': 'Незворотно — руйнує історичні знімки виробничих замовлень, що посилаються на цю версію.',
            'warning': 'Версію {version} буде остаточно видалено. Знімки виробничих замовлень у плануванні, що посилаються на цю версію, відображатимуться як «осиротілі».',
            'blockedBySnapshots': 'Заблоковано: {count} знімк(ів) виробничих замовлень посилаються на {version}. Спочатку видаліть знімки.',
            'blockedByStatus': 'Видаляти можна лише чернеткові версії. Активні або затверджені версії ніколи не видаляються.',
            'confirmLabel': 'Введіть {version} для підтвердження',
            'cancel': 'Скасувати',
            'delete': 'Видалити версію',
        },
        'technical.bom.edit': {
            'usabilityBlocked': 'Компонент заблоковано ({code}): {message}',
        },
        'technical.bom.newBom': {
            'blockedHint': 'BOM можна створити лише для активних готових виробів.',
        },
        'technical.bom.newBom.status': {
            'blocked': 'Заблоковано',
        },
        'Technical.releaseBundle': {
            'approveBlocked': 'Затвердити (заблоковано)',
        },
    },
}


def node(root, dotted):
    cur = root
    for part in dotted.split('.'):
        cur = cur[part]
    return cur


def main():
    for locale in ('en', 'pl', 'ro', 'uk'):
        path = os.path.join(I18N, locale + '.json')
        with open(path, encoding='utf-8') as fh:
            raw = fh.read()
        data = json.loads(raw)
        assert json.dumps(data, indent=2, ensure_ascii=False) + '\n' == raw, (
            'bundle %s does not round-trip; refusing to rewrite it' % locale
        )

        bom = node(data, 'technical.bom')
        assert 'rowActions' not in bom, 'rowActions already present in ' + locale
        # Insert right after `actions` — dicts keep insertion order, and the survey
        # confirmed all four bundles share this sub-key order.
        rebuilt = {}
        for key, value in bom.items():
            rebuilt[key] = value
            if key == 'actions':
                rebuilt['rowActions'] = ROW_ACTIONS[locale]
        assert 'rowActions' in rebuilt, 'anchor key `actions` missing in ' + locale
        node(data, 'technical')['bom'] = rebuilt

        for dotted, pairs in TRANSLATIONS.get(locale, {}).items():
            target = node(data, dotted)
            for key, value in pairs.items():
                assert key in target, 'unknown key %s.%s in %s' % (dotted, key, locale)
                target[key] = value

        with open(path, 'w', encoding='utf-8') as fh:
            fh.write(json.dumps(data, indent=2, ensure_ascii=False) + '\n')
        print('rewrote', path)


if __name__ == '__main__':
    main()
