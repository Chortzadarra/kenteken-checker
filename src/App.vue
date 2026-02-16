<script setup>
import { ref } from 'vue'
import { getVoertuigData, beoordeelGeschiktheid } from './services/rdwService.js'

const kenteken = ref('')
const resultaat = ref(null)
const isLoading = ref(false)
const error = ref(null)

const checkKenteken = async () => {
  if (!kenteken.value) {
    alert('Voer een kenteken in')
    return
  }

  isLoading.value = true
  resultaat.value = null
  error.value = null

  try {
    const voertuigData = await getVoertuigData(kenteken.value)
    const beoordeling = beoordeelGeschiktheid(voertuigData)

    const vermogenKW = parseInt(voertuigData.nettomaximumvermogen) || 0
    const maxMassa = parseInt(voertuigData.toegestane_maximum_massa_voertuig) || 0

    resultaat.value = {
      kenteken: voertuigData.kenteken,
      merk: voertuigData.merk,
      model: voertuigData.handelsbenaming || 'Onbekend',
      bouwjaar: voertuigData.datum_eerste_toelating?.substring(0, 4),
      voertuigsoort: voertuigData.voertuigsoort,
      maxMassa: maxMassa,
      brandstof: voertuigData.brandstof_omschrijving || 'Onbekend',
      vermogen: vermogenKW,
      vermogenPK: Math.round(vermogenKW * 1.36),
      emissieklasse: voertuigData.emissiecode_omschrijving,
      tellerstandOordeel: voertuigData.tellerstandoordeel,
      apkVervaldatum: voertuigData.vervaldatum_apk_dt,
      lengte: voertuigData.lengte,
      breedte: voertuigData.breedte,
      hoogte: voertuigData.hoogte_voertuig,
      brutoBpm: voertuigData.bruto_bpm,
      restBpm: beoordeling.restBpm,
      score: beoordeling.score,
      geschikt: beoordeling.score !== 'Ongeschikt',
      redenen: beoordeling.redenen
    }
  } catch (err) {
    error.value = err.message || 'Er ging iets mis bij het ophalen van de data'
  } finally {
    isLoading.value = false
  }
}

const getStatusClass = (score) => {
  if (score === 'Geschikt') return 'status-geschikt'
  if (score === 'Mogelijk') return 'status-mogelijk'
  return 'status-ongeschikt'
}

const getStatusIcon = (score) => {
  if (score === 'Geschikt') return '✅'
  if (score === 'Mogelijk') return '⚠️'
  return '❌'
}

const getStatusText = (score) => {
  if (score === 'Geschikt') return 'Geschikt voor camperombouw'
  if (score === 'Mogelijk') return 'Mogelijk geschikt - met kanttekeningen'
  return 'Niet geschikt voor camperombouw'
}

const getMassaClass = (massa) => {
  if (massa >= 3500) return 'massa-goed'
  if (massa >= 3000) return 'massa-matig'
  return 'massa-slecht'
}

const getMassaLabel = (massa) => {
  if (massa >= 3500) return 'Ideaal'
  if (massa >= 3000) return 'Mogelijk - lichtgewicht inbouw nodig'
  return 'Te laag!❌'
}

const getEmissieUitleg = (emissieklasse) => {
  if (!emissieklasse) return null
  const uitleg = {
    '6': { status: 'Uitstekend', tekst: 'Je hebt hiermee de meeste reisvrijheid en toegang tot vrijwel alle milieuzones in Europa.' },
    '5': { status: 'Beperkt', tekst: 'Toegang tot de meeste zones, maar wordt in steeds meer grote steden geweigerd.' },
    '4': { status: 'Risicovol', tekst: 'Veel steden zijn met deze klasse al niet meer toegankelijk.' },
    '3': { status: 'Slecht', tekst: 'Je mag bijna nergens de milieuzones in.' }
  }
  const s = String(emissieklasse)
  if (uitleg[s]) return { klasse: 'Euro ' + s, ...uitleg[s] }
  for (let [k, v] of Object.entries(uitleg)) {
    if (s.includes(k)) return { klasse: 'Euro ' + k, ...v }
  }
  return null
}
</script>

<template>
  <div class="container">
    <h1>CamperBouwCheck</h1>
    <p class="subtitle">Voer een kenteken in en zie meteen of deze bus klaar is voor ombouw!</p>

    <div class="input-section">
      <input
        v-model="kenteken"
        type="text"
        placeholder="Bijv: AA-12-BB"
        @keyup.enter="checkKenteken"
      />
      <button @click="checkKenteken" :disabled="isLoading">
        <span v-if="!isLoading">🔍 Controleer</span>
        <span v-else>⏳ Bezig...</span>
      </button>
    </div>

    <div v-if="error" class="error">
      ⚠️ {{ error }}
    </div>

    <div v-if="resultaat" class="resultaat">
      <h2>Resultaat voor {{ resultaat.kenteken }}</h2>

      <div :class="['status-card', getStatusClass(resultaat.score)]">
        <div class="status-icon">{{ getStatusIcon(resultaat.score) }}</div>
        <div class="status-text">{{ getStatusText(resultaat.score) }}</div>
      </div>

      <div class="specs-grid">
        <div class="spec-card">
          <div class="spec-label">⚖️ Max. massa</div>
          <div class="spec-value">{{ resultaat.maxMassa }} kg</div>
          <div :class="['spec-indicator', getMassaClass(resultaat.maxMassa)]">
            {{ getMassaLabel(resultaat.maxMassa) }}
          </div>
        </div>

        <div class="spec-card">
          <div class="spec-label">⚡ Vermogen</div>
          <div class="spec-value">{{ resultaat.vermogen }} kW</div>
          <div class="spec-subvalue">{{ resultaat.vermogenPK }} pk</div>
        </div>

        <div class="spec-card bpm-card">
          <div class="spec-label">💰 Rest-BPM (Schatting)</div>
          <div class="spec-value">€{{ resultaat.restBpm.toLocaleString('nl-NL') }}</div>
          <div class="spec-subvalue">Indicatie bij ombouw</div>
        </div>

        <div class="spec-card spec-card-emissieklasse">
          <div class="spec-label">🌱 Emissieklasse</div>
          <div class="spec-value">{{ resultaat.emissieklasse || 'Onbekend' }}</div>
          <div v-if="getEmissieUitleg(resultaat.emissieklasse)" class="emissieklasse-uitleg">
            <div class="emissieklasse-status"><strong>{{ getEmissieUitleg(resultaat.emissieklasse).status }}</strong></div>
            <div class="emissieklasse-tekst">{{ getEmissieUitleg(resultaat.emissieklasse).tekst }}</div>
          </div>
        </div>
      </div>

      <div class="afmetingen-section">
        <h3>📏 Afmetingen & Blok-eis</h3>
        <div class="afmeting-row">
          <span class="afmeting-naam">Totale voertuighoogte</span>
          <span class="afmeting-waarde">{{ resultaat.hoogte ? resultaat.hoogte + ' cm' : 'Onbekend' }}</span>
        </div>
        <div class="afmeting-row">
          <span class="afmeting-naam">Totale voertuiglengte</span>
          <span class="afmeting-waarde">{{ resultaat.lengte ? resultaat.lengte + ' cm' : 'Onbekend' }}</span>
        </div>
      </div>

      <div class="redenen">
        <h3>Overwegingen:</h3>
        <ul>
          <li v-for="(reden, index) in resultaat.redenen" :key="index">{{ reden }}</li>
        </ul>
      </div>

      <div class="details-section">
        <h3>Voertuiggegevens</h3>
        <div class="details-grid">
          <div><strong>Merk:</strong> {{ resultaat.merk }}</div>
          <div><strong>Model:</strong> {{ resultaat.model }}</div>
          <div><strong>Bouwjaar:</strong> {{ resultaat.bouwjaar }}</div>
          <div><strong>Bruto BPM:</strong> €{{ parseInt(resultaat.brutoBpm || 0).toLocaleString('nl-NL') }}</div>
        </div>
      </div>

    </div> <footer class="disclaimer">
    <p>
      <strong>Disclaimer:</strong> Aan de resultaten van deze applicatie kunnen geen rechten worden ontleend.
      De getoonde informatie is gebaseerd op openbare RDW-data en forfaitaire berekeningen.
      Controleer altijd de actuele wetgeving van de Belastingdienst en de RDW voordat u overgaat tot aankoop.
      De maker is niet aansprakelijk voor eventuele onjuistheden of beslissingen op basis van deze tool.
    </p>
  </footer>
  </div>
</template>

<style scoped>
* { box-sizing: border-box; }
  
.container { 
  max-width: 800px; 
  margin: 30px auto; 
  padding: 20px; 
  font-family: sans-serif; 
  color: #2c3e50; 
}
  
h1 {
  text-align: center;
  margin-bottom: 5px;
  font-weight: 800;
}

.subtitle {
  text-align: center;
  color: #64748b;
  font-size: 16px;
  margin-bottom: 30px;
}


.input-section { 
  display: flex; 
  flex-direction: column; 
  gap: 12px; margin: 30px 0; 
  background: #f8fafc; 
  padding: 15px; 
  border-radius: 16px; 
}
  
input { 
  flex: 1; 
  padding: 16px; 
  font-size: 22px; 
  border: 2px solid #e2e8f0; 
  border-radius: 12px; 
  text-transform: uppercase; 
  text-align: center; 
  width: 100%; 
}
  
input:focus { 
  outline: none; 
  border-color: #42b983; 
}

button { 
  padding: 16px 30px; 
  font-size: 18px; 
  background-color: #42b983; 
  color: white; 
  border: none; 
  border-radius: 12px; 
  cursor: pointer; 
  font-weight: 700; 
  display: flex; 
  align-items: center; 
  justify-content: center; 
  gap: 8px; 
}
  
button:hover:not(:disabled) { background-color: #359268; }
  
button:disabled { background-color: #cbd5e1; }

@media (min-width: 600px) {
  .input-section { flex-direction: row; padding: 0; background: transparent; }
  input { text-align: left; }
}

.status-card { 
  padding: 25px; 
  border-radius: 16px; 
  text-align: center; 
  margin-bottom: 30px; 
  border: 3px solid; 
}
  
.status-geschikt { 
  background-color: #d4edda; 
  border-color: #28a745; 
  color: #155724; 
}
  
.status-mogelijk { 
  background-color: #fff3cd; 
  border-color: #ffc107; 
  color: #856404; 
}
  
.status-ongeschikt { 
  background-color: #f8d7da; 
  border-color: #dc3545; 
  color: #721c24; 
}
  
.status-icon { 
  font-size: 48px; 
}

.specs-grid { 
  display: grid; 
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
  gap: 15px; margin-bottom: 30px; 
}
  
.spec-card { 
  background: white; 
  padding: 20px; 
  border-radius: 12px; 
  box-shadow: 0 4px 6px rgba(0,0,0,0.1); 
  text-align: center; 
}
  
.bpm-card { 
  border-top: 5px solid #3498db; 
}
  
.spec-label { 
  font-size: 14px; 
  color: #64748b; 
  margin-bottom: 8px; 
}
  
.spec-value { 
  font-size: 24px; 
  font-weight: 800; 
}

.afmetingen-section, .details-section { 
  background-color: #f8fafc; 
  padding: 20px; 
  border-radius: 16px; 
  margin-bottom: 20px; }
  
.afmeting-row { 
  display: flex; 
  justify-content: space-between; 
  padding: 12px 0; 
  border-bottom: 1px solid #e2e8f0; 
}
  
.details-grid { 
  display: grid; 
  grid-template-columns: 1fr 1fr; 
  gap: 12px; 
}

.redenen ul { 
  list-style: none; 
  padding: 0; 
}
  
.redenen li { 
  padding: 14px; 
  margin-bottom: 10px; 
  background: #fff; 
  border-left: 4px solid #42b983; 
  border-radius: 8px; 
  box-shadow: 0 1px 3px rgba(0,0,0,0.05); 
}

.disclaimer {
  margin-top: 40px;
  padding: 20px;
  border-top: 1px solid #e2e8f0;
  text-align: center;
}

.disclaimer p {
  font-size: 12px;
  color: #94a3b8;
  line-height: 1.6;
  max-width: 600px;
  margin: 0 auto;
}

.error { 
  background-color: #fef2f2; 
  color: #991b1b; 
  padding: 16px; 
  border-radius: 12px; 
  margin-bottom: 20px; 
}
</style>
