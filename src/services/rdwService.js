const RDW_API_URL = 'https://opendata.rdw.nl/resource/m9d7-ebf2.json'
const RDW_BRANDSTOF_API_URL = 'https://opendata.rdw.nl/resource/8ys7-d773.json'

export async function getVoertuigData(kenteken) {
  // Kenteken formatteren (streepjes verwijderen en hoofdletters)
  const geformateerdKenteken = kenteken.replace(/-/g, '').toUpperCase()

  try {
    // Haal basis voertuigdata op
    const response = await fetch(`${RDW_API_URL}?kenteken=${geformateerdKenteken}`)

    if (!response.ok) {
      throw new Error('API request failed')
    }

    const data = await response.json()

    if (data.length === 0) {
      throw new Error('Kenteken niet gevonden')
    }

    const voertuig = data[0]

    // Haal brandstof/emissie data op
    try {
      const brandstofResponse = await fetch(`${RDW_BRANDSTOF_API_URL}?kenteken=${geformateerdKenteken}`)
      const brandstofData = await brandstofResponse.json()

      if (brandstofData.length > 0) {
        voertuig.brandstof_omschrijving = brandstofData[0].brandstof_omschrijving
        voertuig.emissiecode_omschrijving = brandstofData[0].emissiecode_omschrijving
        voertuig.nettomaximumvermogen = brandstofData[0].nettomaximumvermogen
      }
    } catch (error) {
      console.warn('Kon brandstof data niet ophalen:', error)
    }

    return voertuig
  } catch (error) {
    console.error('RDW API error:', error)
    throw error
  }
}

export function beoordeelGeschiktheid(voertuig) {
  const redenen = []
  let geschiktheidScore = 'Geschikt'
  const nu = new Date()

  // 1. Maximaal toegestane massa
  const maxMassa = parseInt(voertuig.toegestane_maximum_massa_voertuig)
  if (maxMassa > 3500) {
    redenen.push('⚠️ LET OP: Maximaal gewicht >3500kg - groot rijbewijs (C/C1) vereist!')
    geschiktheidScore = 'Mogelijk'
  } else if (maxMassa === 3500) {
    redenen.push('✅ Ideaal maximaal gewicht (3500kg) - perfect voor B-rijbewijs')
  } else if (maxMassa < 3000) {
    redenen.push('❌ Maximaal gewicht is te laag (<3000kg) voor een zinvolle camperombouw.')
    geschiktheidScore = 'Ongeschikt'
  }

  // 2. Hoogte check (Blok-eis)
  const hoogte = parseInt(voertuig.hoogte_voertuig)
  if (hoogte && hoogte < 185) {
    redenen.push('⚠️ Let op: deze bus is waarschijnlijk te laag zonder hefdak (stahoogte eis 170cm).')
  } else if (hoogte >= 185) {
    redenen.push('✅ Voertuighoogte lijkt voldoende voor de 170cm stahoogte-eis.')
  }

  // 3. Emissieklasse
  const emissieklasse = voertuig.emissiecode_omschrijving
  if (emissieklasse) {
    const emissieCijfer = parseInt(emissieklasse.replace(/\D/g, ''))
    if (emissieCijfer >= 6) {
      redenen.push(`✅ Euro ${emissieCijfer}: Uitstekende reisvrijheid in milieuzones.`)
    } else if (emissieCijfer === 5) {
      redenen.push(`✅ Euro 5: Goede toegang, maar let op toekomstige beperkingen.`)
    } else {
      redenen.push(`⚠️ Euro ${emissieCijfer || emissieklasse}: Lage emissieklasse beperkt je toegang tot veel steden.`)
      if (geschiktheidScore === 'Geschikt') geschiktheidScore = 'Mogelijk'
    }
  }

  // 4. NAP / Tellerstand check
  const tellerstand = voertuig.tellerstandoordeel
  if (tellerstand === 'Logisch') {
    redenen.push('✅ Tellerstand logisch (NAP)')
  } else {
    // Bij 'Onlogisch', 'Geen oordeel' of als het veld leeg is
    redenen.push('⚠️ LET OP: Geen logische tellerstand (NAP) gevonden. Controleer de onderhoudshistorie extra goed!')
  }

  // 5. BPM Berekening
  const brutoBpm = parseInt(voertuig.bruto_bpm) || 0
  const datumToelatingStr = voertuig.datum_eerste_toelating
  let restBpm = 0

  if (brutoBpm > 0 && datumToelatingStr) {
    const jaar = parseInt(datumToelatingStr.substring(0, 4))
    const maand = parseInt(datumToelatingStr.substring(4, 6)) - 1
    const dag = parseInt(datumToelatingStr.substring(6, 8))
    const datumToelating = new Date(jaar, maand, dag)
    const maandenOud = (nu.getFullYear() - datumToelating.getFullYear()) * 12 + (nu.getMonth() - datumToelating.getMonth())

    if (maandenOud < 210) {
      let korting = 0
      if (maandenOud < 1) korting = 0
      else if (maandenOud < 9) korting = 15 + (maandenOud * 2)
      else if (maandenOud < 114) korting = 37 + ((maandenOud - 9) * 0.5)
      else korting = 89 + ((maandenOud - 114) * 0.1)

      korting = Math.min(korting, 100)
      restBpm = Math.max(0, Math.round(brutoBpm * (1 - (korting / 100))))
      redenen.push(`💰 Geschatte rest-BPM: €${restBpm.toLocaleString('nl-NL')} (Schatting op basis van leeftijd).`)
    } else {
      redenen.push('✅ Geen rest-BPM meer verschuldigd (voertuig ouder dan 17,5 jaar).')
    }
  }

  // 6. APK
  if (voertuig.vervaldatum_apk_dt && new Date(voertuig.vervaldatum_apk_dt) < nu) {
    redenen.push('❌ APK is verlopen!')
  }

  return {
    redenen,
    score: geschiktheidScore,
    restBpm
  }
}
