interface I18n {
  process :(element:Document, translations:any) => void;
}

declare var i18nTemplate :I18n;
