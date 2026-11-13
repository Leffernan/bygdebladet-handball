# Bygdebladet Lokalhandball

Eit nynorsk kampsenter for lokalhandball med resultat, kommande kampar og offisielle tabellar frå Norges Håndballforbund. Klubb- og klassefiltera fungerer i alle tre visingane.

## Lag og kjelder

`config/teams.json` inneheld elleve lag i sesongen 2026/27. Det omfattar åtte ungdomslag frå Haram, Skodje og Vestnes Varfjell, dei to damelaga og Spjelkavik G16, som har Haram og Skodje som partnarklubbar i klassen. Spjelkavik G16 er synleg under alle tre klubbfiltera. Laga blir følgde med NHF-lag-ID, slik at nye turnerings-ID-ar blir oppdaga ved nye terminoppslag.

`scripts/sync.py` brukar offentlege terminlister og tabellar på handball.no. Han sjekkar terminlistene dagleg, og sjekkar dei aktuelle turneringane når ein kamp er venta ferdig. Berre offentlege sluttresultat blir viste. Oppgjer som er avlyste eller utsette, og gamle oppgjer utan resultat, blir filtrerte ut av kampoversikta. Kommande kampar utan dato står under «Tid ikkje fastsett».

Logoane til Skodje, Vestnes Varfjell og Spjelkavik kjem frå [Bygdebladet Lokalfotball](https://github.com/Leffernan/bygdebladet-lokalfotball/tree/main/assets/team-logos). Haram HK-logoen kjem frå [klubben si nettside](https://www.haramhandball.no/haram-hk/).

## Lokal køyring

```sh
python3 scripts/sync.py --force
python3 -m http.server 8000
```

Opne `http://localhost:8000/`.

## GitHub Pages

Vel **GitHub Actions** under **Settings → Pages → Build and deployment → Source**. Arbeidsflyten `Oppdater og publiser lokalhandball` kan køyrast manuelt frå **Actions**. Han blir òg køyrd kvart 15. minutt og ved endringar på `main`. Han oppdaterer `data/handball.json` når innhaldet er endra og publiserer nettsida som eit Pages-artefakt.

## Innbygging på bygdebladet.com

```html
<iframe
  src="https://leffernan.github.io/bygdebladet-handball/"
  title="Bygdebladet Lokalhandball"
  style="width:100%;height:1100px;border:0"
></iframe>
<script src="https://leffernan.github.io/bygdebladet-handball/embed-host.js" defer></script>
```

Vertsskriptet lèt kampdialogen bruke heile skjermen og gjenopprettar rulleposisjonen når dialogen blir lukka. Meldingsprotokollen er avgrensa til denne sida og bygdebladet.com.
