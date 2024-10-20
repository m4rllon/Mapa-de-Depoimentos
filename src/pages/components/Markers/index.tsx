import { Marker, MarkerClusterer, SuperClusterAlgorithm } from "@googlemaps/markerclusterer"
import { AdvancedMarker, useMap } from "@vis.gl/react-google-maps"
import { useCallback, useEffect, useRef, useState } from "react"
import { getPointsWithCluster } from "../../../utils/getPointsWithCluster"
import { getStringFiltered } from "../../../utils/filterStrings"
import { setStringDepo } from "../../../utils/setStringDepo"
import { PopupContent } from "../Popup"
import { createRoot } from "react-dom/client"
import WordCloud from "react-d3-cloud"
import getWordCloudDataWithString from "../../../utils/getWordCloudDataWithString"

type point = google.maps.LatLngLiteral & {key:string, aloneControler:boolean, name:string, depo:string}
type Props = {points: point[]}


export default function Markers({points}:Props){
    class Popup extends window.google.maps.OverlayView {
        position: google.maps.LatLng;
        containerDiv: HTMLDivElement;
    
        constructor(position: google.maps.LatLng, content: HTMLElement) {
          super();
          this.position = position;
          content.classList.add("popup-bubble");
    
          const bubbleAnchor = document.createElement("div");
          bubbleAnchor.classList.add("popup-bubble-anchor");
          bubbleAnchor.appendChild(content);
    
          this.containerDiv = document.createElement("div");
          this.containerDiv.classList.add("popup-container");
          this.containerDiv.appendChild(bubbleAnchor);
    
          Popup.preventMapHitsAndGesturesFrom(this.containerDiv);
        }
    
        onAdd() {
          this.getPanes()!.floatPane.appendChild(this.containerDiv);
        }
    
        onRemove() {
          if (this.containerDiv.parentElement) {
            this.containerDiv.parentElement.removeChild(this.containerDiv);
          }
        }
    
        draw() {
          const divPosition = this.getProjection()?.fromLatLngToDivPixel(
            this.position
          );
    
          if (!divPosition) return;
    
          const display =
            Math.abs(divPosition.x) < 4000 && Math.abs(divPosition.y) < 4000
              ? "block"
              : "none";
    
          if (display === "block") {
            this.containerDiv.style.left = divPosition.x + "px";
            this.containerDiv.style.top = divPosition.y + "px";
          }
    
          if (this.containerDiv.style.display !== display) {
            this.containerDiv.style.display = display;
          }
        }
    }

    const map = useMap() //Acessar o próprio mapa

    const [ marcadores, setMarcadores ] = useState<{[key:string]: Marker}>({}) //Acessar todos os marcadores presentes no mapa
    const clusterer = useRef<MarkerClusterer | null>(null) //Acessar o cluster de marcadores
    const [ statusPopup, setStatusPopup ] = useState<boolean>(true)
    const [ popup, setPopup ] = useState<Popup | null>(null)
    const [ wordTarget, setWordTarget ] = useState(null)
    const [ clusterTarget, setClusterTarget ] = useState<{markers:Marker[] | undefined, position: google.maps.LatLng}| null>(null)
    
    const colors = ['#333333', '#000000', '#131212', '#222221'];

    useEffect(()=>{
        if(!map) return //Caso não tenha o mapa, não faça nada
        if(!clusterer.current){ //Caso não tenha um cluster, vamos configurá=lo pela primeira vez
            clusterer.current = new MarkerClusterer({ 
                map, 
                algorithm: new SuperClusterAlgorithm({
                    radius: 700, // Aumente o valor para expandir o range de agrupamento
                }),
            })
        } 
    }, [map])

    const setMarkerRef = (marker: Marker | null, key: string) => { //O objetivo desse método é grupar os marcadores em 'markers'
        //Se o marker tivermos um marker e se o marker já estiver em 'markers', não precisamos fazer nada
        if(marker  && marcadores[key]) return 
        //Se o marker for null e se não tivermos esse marker em 'markers' de qualquer forma, não precisamos fazer nada
        if(!marker && !marcadores[key]) return 
        
        setMarcadores(prev => {
            if(marker){ //Aqui vamos adicionar o marker caso ele não esteja em 'markers'
                return {...prev, [key]: marker}
            } else { //Aqui vamos deletar o marker que ele já estiver em 'markers'
                const newMarkers = {...prev}
                delete newMarkers[key]
                return newMarkers
            }
        })
    }

    const buildContent = (data:{text:string, value:number}[], cluster:{markers:Marker[] | undefined, position: google.maps.LatLng}| null) => {
        const imageIcon = document.createElement('div')
        imageIcon.style.width = '350px'
        imageIcon.style.height = '200px'
        imageIcon.id = 'content'
        const root = createRoot(imageIcon)
        root.render(<div>
            <WordCloud 
            data={data} 
            height={200} 
            width={350}
            fontSize={()=> 24}
            fontWeight={()=> 'bold'}
            onWordClick={(_, b)=> {
                // @ts-expect-error: Unreachable
                setWordTarget(b)
                setClusterTarget(cluster)
            }}
            rotate={()=>0}
            random={() => 0.5}
            padding={()=> 4}
            fill={() => colors[Math.floor(Math.random() * colors.length)]} 
            />
        </div>)
        return imageIcon
    }


    useEffect(()=>{
        clusterer.current?.clearMarkers() //Sempre que os 'markers' mudarem, vamos excluir os markers que estavam apresentes no cluster e...
        clusterer.current = new MarkerClusterer(
            {map,
                
            algorithm: new SuperClusterAlgorithm({
                radius: 750, // Aumente o valor para expandir o range de agrupamento
            }),
            
            renderer: { //Criando novo cluster com ícone personalizado
                render: ({ position, markers }) => {
                    const listaDePontosDoCluster = getPointsWithCluster(points, markers)
                    const depoimento = setStringDepo(listaDePontosDoCluster)
                    const depoimentoFormatado = getStringFiltered(depoimento)
                    const dataWordCloud = getWordCloudDataWithString(depoimentoFormatado)
                    
                    const imageIcon = buildContent(dataWordCloud, {markers, position})
                    
                    return new google.maps.marker.AdvancedMarkerElement({
                        position,
                        content: imageIcon,
                        gmpClickable: true,
                    });
                }
            },
            
            onClusterClick: () => {},
        })
        clusterer.current?.addMarkers(Object.values(marcadores)) //adicionamos os marcadores novos presentes no novo estado de 'markers'
        //Note que, 'markers' é um objeto, por isso usamos o 'Object.values' para pegar as instancias Marker propriamete dita
        // console.log(clusterer.current.clusters)  
    }, [marcadores])
    
    useEffect(()=>{
        if(!statusPopup){
            popup?.setMap(null)
            setStatusPopup(true)
        } 
    }, [statusPopup])
    
    useEffect(()=> {
        clusterer.current?.addListener('click', ()=>{
            const listaDePontos = getPointsWithCluster(points, clusterTarget?.markers)
            const posicaoDoCluster = {lat: clusterTarget?.position.lat(), lng: clusterTarget?.position.lng()}
            
            popup?.setMap(null)
            
            const content = document.createElement('div')
            content.id = 'content'
            
            const root = createRoot(content)
            root.render(<PopupContent listaDePontos={listaDePontos} closePopup={setStatusPopup} wordTarget={wordTarget}/>)
            
            const newPopup = new Popup(
                // @ts-expect-error: Unreachable
                new google.maps.LatLng(posicaoDoCluster),
                content
            )
            
            setPopup(newPopup)
            newPopup.setMap(map)
        })
    }, [wordTarget])

    const renderMarkersComponents = useCallback(() => {
        return points.map((ponto) => <div key={ponto.key} style={{width: '300px', height: '150px'}}>
        {
            ponto.aloneControler 
            ?  <WordCloud 
            data={getWordCloudDataWithString(ponto.depo)} 
            height={150} 
            width={300}
            fontSize={()=> 24}
            fontWeight={()=> 'bold'}
            rotate={()=>0}
            random={() => 0.5}
            padding={()=> 4}
            fill={() => colors[Math.floor(Math.random() * colors.length)]} 
            />
            : <></>
        }
        
    </div>)
    }, [])

    const findWordCloudTarget = (key:string) => {
        return renderMarkersComponents().find(component => component.key === key)
    }
    
    return <>
    {
        points.map(point => { 
            return <AdvancedMarker
            position={point} 
            key={point.key}
            ref={marker => {
                // A função callback do atributo 'ref' recebe como argumento o própro elemento que o 'ref' está referenciando. É uma forma de acessá-lo em outra função diretamente
                setMarkerRef(marker, point.key)}}
            onClick={() => {console.log(point)}}
            > 
            {findWordCloudTarget(point.key)}
        </AdvancedMarker>
        })
    }
    </>
}